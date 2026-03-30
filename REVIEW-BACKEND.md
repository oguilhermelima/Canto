# Review: Backend, APIs Externas & Cache

Levantamento completo das dependências de APIs externas em tempo de request, estratégia de cache atual, e oportunidades de melhoria.

---

## 1. Endpoints que dependem de API externa em tempo real

### 1.1 TMDB — Discovery & Browse (sem cache, sem persistência)

Esses endpoints batem no TMDB **toda vez** que o usuário abre a página. Nada é salvo.

| Endpoint | O que faz | Calls por request | Cache | Persiste? |
|----------|-----------|-------------------|-------|-----------|
| `media.search` | Busca por título | 1 | Nenhum | Não |
| `media.discover` | Trending + filtros no Discover | 1 | Nenhum | Não |
| `media.getPerson` | Bio + filmografia de ator | 1 | Nenhum | Não |
| `media.recommendations` | Recomendações baseadas na library | **3 × N** (extras + images + videos por item) | Nenhum | Não |
| `provider.spotlight` | Hero do home (trending + detalhes + logos) | **~22** (2 trending + 10×2 detalhes) | 1 hora (settings table) | Settings only |
| `provider.regions` | Regiões de streaming | 1 | Nenhum | Não |
| `provider.watchProviders` | Lista de providers por região | 1 | Nenhum | Não |
| `provider.networks` | Busca de TV networks | 1 | Nenhum | Não |
| `provider.companies` | Busca de produtoras | 1 | Nenhum | Não |

**Pior caso**: `media.recommendations` com 100 itens na library = **300 calls** ao TMDB numa única pageview.

### 1.2 TMDB — Metadata (persiste no DB)

Esses endpoints buscam do TMDB mas **salvam no banco**. Chamadas subsequentes usam o DB.

| Endpoint | O que faz | Cache | Persiste? |
|----------|-----------|-------|-----------|
| `media.getByExternal` | Metadata completo (persist on visit) | Nenhum (mas idempotente) | Sim — media + seasons + episodes |
| `media.getExtras` | Credits, similar, videos, watch providers | 7 dias (`extrasCache` table) | Cache no PostgreSQL |
| `media.updateMetadata` | Refresh manual de metadata | Nenhum | Sim — atualiza media existente |
| `sync.resolveSyncItem` | Match manual de sync item → TMDB | Nenhum | Sim — media + syncItem |
| `sync.searchForSyncItem` | Busca TMDB pra resolver sync | Nenhum | Não |

### 1.3 Serviços Locais (Jellyfin, Plex, qBittorrent)

Esses são **esperados** — interagem com serviços na rede local. Não precisam de cache.

| Endpoint | Serviço | Frequência |
|----------|---------|------------|
| `torrent.listLive` / `listLiveByMedia` | qBittorrent | Polling 3s (drawer aberto) |
| `torrent.download/pause/resume/delete/import` | qBittorrent | Sob demanda |
| `jellyfin.testConnection/syncLibraries/scan` | Jellyfin | Sob demanda |
| `plex.testConnection/syncLibraries/scan` | Plex | Sob demanda |
| `settings.testService` | Vários | Sob demanda |
| `settings.authenticateJellyfin/Plex` | Jellyfin/Plex | Sob demanda |
| `settings.plexPinCreate/Check` | plex.tv | OAuth flow |

### 1.4 Indexers (Prowlarr, Jackett)

| Endpoint | Serviço | Cache | Nota |
|----------|---------|-------|------|
| `torrent.search` | Prowlarr e/ou Jackett | Nenhum | Busca ativa, não precisa de cache |

---

## 2. Imagens — 100% dependente de CDN externa

### O que armazenamos no banco

| Tabela | Colunas | Formato |
|--------|---------|---------|
| `media` | `posterPath`, `backdropPath`, `logoPath` | Path suffix TMDB: `/abc123.jpg` |
| `season` | `posterPath` | Path suffix TMDB |
| `episode` | `stillPath` | Path suffix TMDB |
| `extrasCache` (JSONB) | `profilePath` (cast), `logoPath` (providers) | Path suffix TMDB |

### Como o frontend consome

Cada componente monta a URL completa:
```
https://image.tmdb.org/t/p/{size}{path}
```

Tamanhos usados: `w92`, `w185`, `w300`, `w500`, `w1280`, `h632`, `original`.

### Problema

- **Zero resiliência**: se o TMDB mudar a CDN ou cair, todas as imagens quebram
- **Zero cache local**: cada pageview depende da CDN do TMDB
- **AniList é exceção**: salva URL completa (`https://s4.anilist.co/...`), mas mesmo problema
- **Cast/crew sem tabela própria**: vivem no JSONB do `extrasCache`, não são pesquisáveis

### Next.js Image Optimization

Único layer de cache que existe — Next.js faz proxy e otimiza imagens do TMDB via `remotePatterns`:
```ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "image.tmdb.org" },
    { protocol: "https", hostname: "s4.anilist.co" },
  ],
}
```

Isso ajuda em produção (cache em disco do Next.js), mas não é uma estratégia de resiliência real.

---

## 3. Redis — subutilizado

### Uso atual: apenas BullMQ

| Queue | Schedule | Job |
|-------|----------|-----|
| `import-torrents` | A cada 2 min | Importa torrents completos |
| `reverse-sync` | A cada 5 min | Sincroniza Jellyfin/Plex → Canto |
| `refresh-metadata` | Domingo 03:00 | Atualiza metadata da library |
| `cleanup-cache` | Diário 04:00 | Limpa `extrasCache` expirado |

**Único job sob demanda**: `reverse-sync` quando o usuário clica "Sync now".

### O que Redis NÃO faz (mas poderia)

| Capacidade | Status |
|------------|--------|
| Cache de API (TMDB responses) | Não usa |
| Cache de imagens/paths | Não usa |
| Rate limiting (TMDB: 40 req/s free) | Não usa |
| Pub/sub (notificações real-time) | Não usa |
| Session cache | Não usa |
| Cache de queries frequentes | Não usa |

### Infraestrutura atual

- **Imagem**: `redis:7-alpine`
- **Persistência**: Volume Docker (`redis_data:/data`)
- **Conexão**: `host:port:password` via env vars
- **Dependência**: Worker e Web dependem do healthcheck do Redis

---

## 4. Cache que existe no PostgreSQL (deveria estar no Redis?)

| Cache | Tabela | TTL | Lógica |
|-------|--------|-----|--------|
| Media extras (credits, similar, videos) | `extrasCache` | 7 dias | Checado em `media.getExtras` |
| Spotlight data (trending hero) | `settings` | 1 hora | Key `cache.spotlight` |

Ambos são **cache de API response** armazenados no PostgreSQL. Funcionam, mas:
- Ocupam espaço no banco principal
- Sem TTL nativo (precisa de job `cleanup-cache` pra limpar)
- O Redis tem TTL nativo por key — expira automaticamente

---

## 5. Dados estáticos chamados sem cache

Esses dados mudam raramente mas são buscados do TMDB toda vez:

| Dado | Endpoint | Frequência de mudança |
|------|----------|----------------------|
| Regiões de streaming | `provider.regions` | Quase nunca |
| Watch providers por região | `provider.watchProviders` | Mensal |
| Networks (TV) | `provider.networks` | Raro |
| Produtoras | `provider.companies` | Raro |

Candidatos ideais pra cache longo (24h+) no Redis ou até persistência no banco.

---

## 6. Mapa de dependências externas

```
                    ┌─────────────────────────────────────────┐
                    │              Frontend (Next.js)          │
                    │                                          │
                    │  image.tmdb.org ◄── todas as imagens     │
                    │  s4.anilist.co  ◄── imagens AniList      │
                    └──────────────┬───────────────────────────┘
                                   │ tRPC
                    ┌──────────────▼───────────────────────────┐
                    │              API (tRPC)                   │
                    │                                          │
                    │  TMDB API ◄── search, discover, metadata │
                    │               spotlight, extras, person  │
                    │               recommendations, providers │
                    │               regions, networks, companies│
                    │                                          │
                    │  AniList API ◄── search, metadata        │
                    │  TVDB API   ◄── search, metadata         │
                    │                                          │
                    │  Prowlarr ◄── torrent search              │
                    │  Jackett  ◄── torrent search              │
                    │                                          │
                    │  qBittorrent ◄── download, status, import│
                    │  Jellyfin    ◄── scan, auth, libraries   │
                    │  Plex        ◄── scan, auth, libraries   │
                    │  plex.tv     ◄── OAuth PIN flow          │
                    └──────────────┬───────────────────────────┘
                                   │ BullMQ (Redis)
                    ┌──────────────▼───────────────────────────┐
                    │              Worker                       │
                    │                                          │
                    │  TMDB API ◄── refresh metadata            │
                    │  qBittorrent ◄── import torrents          │
                    │  Jellyfin/Plex ◄── reverse sync           │
                    └──────────────────────────────────────────┘
```

---

## 7. Riscos atuais

1. **TMDB rate limit**: 40 req/s no plano free. `recommendations` com library grande pode estourar.
2. **Single point of failure (imagens)**: CDN do TMDB fora = app sem imagens.
3. **Latência desnecessária**: discovery/browse refaz chamadas idênticas a cada pageview.
4. **Escala**: conforme a library cresce, endpoints como `recommendations` degradam linearmente.
5. **Sem retry inteligente**: se TMDB retorna 429 (rate limit), não há backoff — o request simplesmente falha.
6. **Cache no lugar errado**: `extrasCache` no PostgreSQL precisa de job de limpeza manual; Redis faria isso nativamente com TTL.

---

## 8. Decisões

Movidas para [REFACTOR-BACKEND.md](./REFACTOR-BACKEND.md).
