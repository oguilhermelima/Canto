# Refactor: Backend — Clean Architecture

Reestruturação do backend para Clean Architecture simplificado (Application / Domain / Infrastructure), integrando cache Redis, imagens locais, recommendation pool, refresh strategy e features do [ROADMAP-AUTOMATION.md](./ROADMAP-AUTOMATION.md).

---

## 1. Arquitetura atual — problemas

```
packages/api/src/
├── routers/
│   ├── torrent.ts    (2225 loc) ← monolito: 3 API clients + 10 procedures + import + scoring + parsing
│   ├── settings.ts   (554 loc)  ← config CRUD + auth flows Jellyfin/Plex/OAuth tudo junto
│   ├── media.ts      (488 loc)  ← search + metadata + extras + discover + recommendations
│   ├── library.ts    (364 loc)
│   ├── provider.ts   (292 loc)
│   ├── sync.ts       (287 loc)
│   ├── jellyfin.ts   (215 loc)
│   ├── plex.ts       (209 loc)
│   └── auth.ts       (7 loc)
├── lib/
│   ├── server-credentials.ts
│   └── tmdb-client.ts
├── trpc.ts
└── root.ts

apps/worker/src/
├── jobs/
│   ├── import-torrents.ts    ← duplica lógica do router
│   ├── reverse-sync.ts
│   ├── refresh-metadata.ts   ← batch semanal, vai morrer
│   └── cleanup-cache.ts      ← vai morrer
└── index.ts
```

**Problemas**:
1. Routers contêm lógica de negócio, clients de API, e queries — fazem tudo
2. `torrent.ts` é um monolito de 2225 loc com 3 classes de client embutidas
3. Worker reimplementa lógica que já existe nos routers
4. `extrasCache` é um JSONB blob não-pesquisável
5. Sem cache layer — cada router reinventa checagem de cache
6. `systemSetting` mistura credenciais, cache e config no mesmo key-value
7. Zero separação entre regras de negócio e I/O

---

## 2. Arquitetura nova — Clean Architecture simplificado

### Princípio

```
Application    → framework-aware (tRPC, BullMQ) — entry points
Domain         → pure TypeScript, zero deps — use cases + regras + ports
Infrastructure → implementações de I/O — adapters, repositories, cache, storage
```

```
                ┌──────────────────────────────┐
                │        APPLICATION            │
                │                               │
                │  tRPC routers (thin)          │
                │  BullMQ job handlers (thin)   │
                │  Dependency injection          │
                └──────────────┬────────────────┘
                               │ chama use cases
                ┌──────────────▼────────────────┐
                │           DOMAIN              │
                │                               │
                │  Use cases (orquestração)     │
                │  Rules (scoring, parsing,     │
                │    quality, naming)            │
                │  Ports (interfaces)            │
                │  Types (entities)              │
                └──────────────┬────────────────┘
                               │ depende de interfaces (ports)
                ┌──────────────▼────────────────┐
                │       INFRASTRUCTURE          │
                │                               │
                │  Adapters (qBit, Prowlarr,    │
                │    Jackett, Jellyfin, Plex)    │
                │  Repositories (Drizzle)        │
                │  Cache (Redis)                 │
                │  Storage (filesystem)          │
                │  Queue (BullMQ dispatcher)     │
                └───────────────────────────────┘
```

**Regra de dependência**: Domain não importa nada de fora — nem Drizzle, nem tRPC, nem ioredis, nem BullMQ. Recebe tudo por parâmetro via ports.

### Estrutura de pastas

```
packages/api/src/
│
├── application/                        ← ENTRY POINTS (framework-aware)
│   ├── routers/                           tRPC procedures (validate → inject deps → call use case → return)
│   │   ├── media.ts                          getById, getByExternal, addToLibrary, removeFromLibrary, updateMetadata, delete, listFiles
│   │   ├── browse.ts                         media.browse + provider.filterOptions + filterSearch + getPerson
│   │   ├── torrent.ts                        search, download, listLive, pause, resume, delete, import
│   │   ├── library.ts                        list, stats, preferences, setDefault, toggleSync
│   │   ├── settings.ts                       config CRUD, service auth
│   │   ├── sync.ts                           reverse sync, media servers, availability
│   │   └── auth.ts                           me
│   ├── jobs/                              BullMQ handlers (inject deps → call use case)
│   │   ├── import-torrents.ts                import completed + check nextAirDate + continuous download
│   │   ├── refresh-extras.ts                 append_to_response → populate tables
│   │   ├── reverse-sync.ts                   Jellyfin/Plex → Canto
│   │   └── download-images.ts                TMDB images → filesystem
│   ├── trpc.ts                            context, middleware
│   └── root.ts                            router tree
│
├── domain/                             ← CORE (pure TypeScript, zero deps externas)
│   ├── use-cases/
│   │   ├── browse-media.ts                search + discover + trending (unificado)
│   │   ├── get-media-detail.ts            persist on visit + stale-while-revalidate
│   │   ├── refresh-extras.ts              append_to_response → populate pool, credits, videos, watch providers
│   │   ├── manage-library.ts              add/remove, preferences, continuous download
│   │   ├── get-recommendations.ts         spotlight, recommendations, similar (queries no pool)
│   │   ├── search-torrents.ts             busca via indexers, dedup, scoring
│   │   ├── download-torrent.ts            grab + track + create placeholders
│   │   ├── import-torrent.ts              move/rename + subtitles + rollback + validation
│   │   ├── torrent-lifecycle.ts           pause, resume, delete, live merge, blocklist
│   │   ├── sync-media-servers.ts          reverse sync (Jellyfin/Plex → Canto)
│   │   ├── download-images.ts             fetch images → save to storage
│   │   └── manage-settings.ts             config CRUD, service auth flows
│   ├── rules/
│   │   ├── scoring.ts                     calculateConfidence(), recencyBonus(), buildScore()
│   │   ├── parsing.ts                     parseSeasons(), parseEpisodes(), parseSubtitleLang(), BARE_EP_PATTERN
│   │   ├── quality.ts                     detectQuality(), detectSource(), qualityHierarchy, QualityProfile
│   │   └── naming.ts                      buildMediaDir(), buildFileName(), buildSubtitleName(), sanitize
│   ├── ports/
│   │   ├── metadata-provider.ts           getMetadata(), search(), getExtras(), getTrending(), discover()
│   │   ├── torrent-client.ts              addTorrent(), pause(), resume(), delete(), listFiles(), setLocation(), renameFile()
│   │   ├── indexer.ts                     search(query) — Prowlarr/Jackett
│   │   ├── media-server.ts                scan(), getLibraries(), syncLibraries()
│   │   ├── media-repository.ts            findById(), persist(), update(), listLibrary(), findEpisodeFile()
│   │   ├── torrent-repository.ts          create(), findByHash(), updateStatus(), findCompleted()
│   │   ├── recommendation-repository.ts   upsert(), listByScore(), listBySource(), listRecent()
│   │   ├── notification-repository.ts     create(), listUnread(), markRead()
│   │   ├── blocklist-repository.ts        add(), check(), listByMedia()
│   │   ├── cache.ts                       get<T>(), set<T>(), invalidate()
│   │   ├── image-storage.ts               download(), getPath(), exists()
│   │   └── job-dispatcher.ts              dispatch(jobName, payload)
│   └── types/
│       ├── media.ts                       Media, Season, Episode, NormalizedMedia
│       ├── torrent.ts                     Torrent, TorrentFile, LiveData, TorrentResult
│       ├── recommendation.ts              RecommendationPool, Score
│       ├── notification.ts                Notification, NotificationType
│       └── common.ts                      Quality, Source, ResolvedState, ProviderName, QualityProfile
│
├── infrastructure/                     ← IMPLEMENTATIONS (I/O, libs externas)
│   ├── adapters/
│   │   ├── qbittorrent.ts                 implements TorrentClientPort
│   │   ├── prowlarr.ts                    implements IndexerPort
│   │   ├── jackett.ts                     implements IndexerPort
│   │   ├── jellyfin.ts                    implements MediaServerPort
│   │   └── plex.ts                        implements MediaServerPort
│   ├── repositories/
│   │   ├── drizzle-media.ts               implements MediaRepositoryPort
│   │   ├── drizzle-torrent.ts             implements TorrentRepositoryPort
│   │   ├── drizzle-recommendation.ts      implements RecommendationRepositoryPort
│   │   ├── drizzle-notification.ts        implements NotificationRepositoryPort
│   │   ├── drizzle-blocklist.ts           implements BlocklistRepositoryPort
│   │   ├── drizzle-library.ts
│   │   ├── drizzle-sync.ts
│   │   └── drizzle-settings.ts
│   ├── cache/
│   │   └── redis.ts                       implements CachePort
│   ├── storage/
│   │   └── filesystem-images.ts           implements ImageStoragePort
│   └── queue/
│       └── bullmq-dispatcher.ts           implements JobDispatcherPort
│
└── index.ts
```

### Como cada camada se comporta

**Router** (application — thin, ~30-50 loc):
```ts
// application/routers/torrent.ts
search: protectedProcedure
  .input(torrentSearchInput)
  .query(({ ctx, input }) =>
    searchTorrents(
      { indexer: prowlarrAdapter, mediaRepo: drizzleMediaRepo(ctx.db), cache: redisCache },
      input,
    )
  ),
```

**Use case** (domain — orquestra via ports):
```ts
// domain/use-cases/search-torrents.ts
import type { IndexerPort } from "../ports/indexer";
import type { MediaRepositoryPort } from "../ports/media-repository";
import { calculateConfidence } from "../rules/scoring";

export async function searchTorrents(
  deps: { indexer: IndexerPort; mediaRepo: MediaRepositoryPort },
  input: { mediaId: string; season?: number; episodes?: number[] },
) {
  const media = await deps.mediaRepo.findById(input.mediaId);
  const results = await deps.indexer.search(buildQuery(media, input));
  return results.map(r => ({ ...r, confidence: calculateConfidence(r, media) }));
}
```

**Rule** (domain — puro, zero I/O):
```ts
// domain/rules/scoring.ts
export function calculateConfidence(result: TorrentResult, media: Media): number {
  // pure logic, testável sem mock
}
```

**Adapter** (infrastructure — implementação real):
```ts
// infrastructure/adapters/qbittorrent.ts
import type { TorrentClientPort } from "../../domain/ports/torrent-client";

export class QBittorrentAdapter implements TorrentClientPort {
  async addTorrent(url: string, category: string): Promise<void> { ... }
  async listTorrents(): Promise<QBitTorrent[]> { ... }
}
```

**Job handler** (application — thin, chama mesmos use cases que routers):
```ts
// application/jobs/import-torrents.ts
export async function handleImportTorrents(db: Database) {
  const pending = await drizzleTorrentRepo(db).findCompleted();
  for (const torrent of pending) {
    await importCompleted(
      { torrentClient: qbittorrentAdapter, torrentRepo: drizzleTorrentRepo(db) },
      torrent,
    );
  }
  await checkActiveShows(
    { mediaRepo: drizzleMediaRepo(db), metadataProvider: tmdbAdapter, dispatcher: bullmqDispatcher },
  );
}
```

`apps/worker/src/index.ts` fica só com setup de queues + schedules + chama handlers de `application/jobs/`.

---

## 3. Imagens — download on persist

Use case `downloadImages()` no domain, `FilesystemImageStorage` no infra.

**Fluxo**:
1. `persistMedia()` → dispara job `download-images` via `JobDispatcherPort`
2. Job chama use case → usa `ImageStoragePort.download(url, path)`
3. Frontend checa imagem local primeiro, fallback TMDB se não existir

**Armazenamento** (Docker volume `images_data:/data/images`):
```
/data/images/
  {mediaId}/poster.jpg, backdrop.jpg, logo.jpg
  seasons/{seasonId}/poster.jpg
  episodes/{episodeId}/still.jpg
```

- Disco estimado: ~270KB por mídia. 1000 mídias ≈ 270MB
- Servir via API route ou Next.js static serving

---

## 4. Endpoints — unificação

### `media.browse` (substitui `media.search` + `media.discover`)

```ts
media.browse({
  mode: "search" | "trending" | "discover",
  query?: string,
  genre?: number,
  sortBy?: string,
  year?: number,
  language?: string,
  page?: number,
})
```

Use case: `browseMedia()`. Cache Redis: `browse:{mode}:{hash}`, TTL **5 min**.

`media.getPerson` continua separado — entidade diferente. Cache Redis: `person:{id}`, TTL **24h**.

### `provider.filterOptions` + `provider.filterSearch` (substitui 4 endpoints)

```ts
provider.filterOptions({ mediaType, region }) → { regions, watchProviders, genres }
// Cache Redis: filterOptions:{type}:{region}, TTL 24h

provider.filterSearch({ type: "network" | "company", query }) → [{ id, name, logoPath }]
// Cache Redis: filterSearch:{type}:{query}, TTL 5 min
```

---

## 5. Recommendation Pool

Tabela pré-computada que serve spotlight, recommendations e similar. Zero calls TMDB no request.

### Schema

```
recommendation_pool
  id               uuid PK
  tmdbId           integer
  mediaType        "movie" | "tv"
  sourceMediaId    uuid FK → media       ← quem gerou essa recomendação
  title            varchar
  overview         text
  posterPath       varchar
  backdropPath     varchar
  logoPath         varchar
  releaseDate      date
  voteAverage      float
  score            float                 ← calculado (popularidade + recência + frequência)
  frequency        integer               ← quantos itens da library recomendam isso
  sourceType       "similar" | "recommendation"
  createdAt        timestamp
  updatedAt        timestamp
```

### Como alimenta

On library add → job `refresh-extras` → 1 call TMDB (`append_to_response=recommendations,similar,credits,videos,watch/providers`) → popula:

| Dado TMDB | Tabela destino |
|-----------|----------------|
| `recommendations` | `recommendation_pool` (sourceType = "recommendation") |
| `similar` | `recommendation_pool` (sourceType = "similar") |
| `credits` | `media_credit` |
| `videos` | `media_video` |
| `watch/providers` | `media_watch_provider` |

### Score

```
score = (voteAverage × 10)
      + (frequency × 25)
      + recencyBonus(releaseDate)     // +50 (30d), +30 (90d), +10 (1ano), 0
```

### Queries

```sql
-- Spotlight: top 10 recentes com backdrop
SELECT * FROM recommendation_pool WHERE backdropPath IS NOT NULL ORDER BY releaseDate DESC LIMIT 10

-- Recommendations: paginado por score
SELECT * FROM recommendation_pool ORDER BY score DESC LIMIT 20 OFFSET :page

-- Similar: recomendações de uma mídia específica
SELECT * FROM recommendation_pool WHERE sourceMediaId = :mediaId
```

### O que morre

- `provider.spotlight` endpoint (22 calls TMDB)
- `media.recommendations` endpoint (3×N calls)
- `extrasCache` table (JSONB blob)
- `cleanup-cache` job
- Cache de spotlight na `systemSetting`

---

## 6. Refresh strategy

Campo `extrasUpdatedAt` (timestamp, nullable) na tabela `media`.

### Shows ativos (status != "Ended", inLibrary = true)

Trigger: `nextAirDate` — o TMDB fornece a data do próximo episódio.

```
Integrado no job import-torrents (roda a cada 2min):

  SELECT * FROM media
  WHERE type = 'tv'
    AND inLibrary = true
    AND status != 'Ended'
    AND nextAirDate <= now()
    AND (extrasUpdatedAt IS NULL OR extrasUpdatedAt < nextAirDate)

  Para cada resultado:
    1. Refresh metadata (1 call append_to_response)
    2. Atualiza episódios, recommendation_pool, credits, etc.
    3. Atualiza nextAirDate pro próximo episódio futuro
    4. Se continuousDownload = true → trigger busca + download do episódio novo
    5. extrasUpdatedAt = now()
```

Pipeline unificada: metadata refresh → recommendation pool → continuous download.

### Shows ended + Movies (inLibrary = true)

Trigger: visita do usuário + stale > 30 dias.

```
No use case getMediaDetail:
  1. Serve dados do DB imediatamente (nunca bloqueia)
  2. Se inLibrary AND (extrasUpdatedAt IS NULL OR extrasUpdatedAt > 30 dias):
     → dispatch job refresh-extras (async)
     → extrasUpdatedAt = now() após conclusão
```

### Resumo

| Tipo | Trigger | Frequência |
|------|---------|------------|
| Show ativo | `nextAirDate <= now()` | Automático no dia do episódio |
| Show ended | Visita + stale 30d | Sob demanda |
| Movie | Visita + stale 30d | Sob demanda |
| Fora da library | Não atualiza | — |

---

## 7. Cache Redis

### Responsabilidades pós-refactor

| Uso | Key pattern | TTL |
|-----|-------------|-----|
| Browse results | `browse:{mode}:{hash}` | 5 min |
| Filter options | `filterOptions:{type}:{region}` | 24h |
| Filter search | `filterSearch:{type}:{query}` | 5 min |
| Person detail | `person:{id}` | 24h |
| BullMQ queues | (internal) | — |

### Regra

Redis = cache **efêmero** de API responses externas. Dados persistentes → PostgreSQL. Imagens → filesystem.

### O que sai do PostgreSQL

| Antes | Depois |
|-------|--------|
| `extrasCache` (JSONB blob) | Tabelas reais: `recommendation_pool`, `media_credit`, `media_video`, `media_watch_provider` |
| `systemSetting` key `cache.spotlight` | Query no `recommendation_pool` |

### Implementação

```ts
// infrastructure/cache/redis.ts — implements CachePort
export const redisCache: CachePort = {
  async get<T>(key: string): Promise<T | null> {
    const hit = await redis.get(key);
    return hit ? (JSON.parse(hit) as T) : null;
  },
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  },
  async invalidate(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  },
};
```

---

## 8. Novas tabelas

### `recommendation_pool` (ver seção 5)

### `media_credit`
```
media_credit
  id            uuid PK
  mediaId       uuid FK → media (cascade)
  personId      integer
  name          varchar
  character     varchar | null
  department    varchar | null
  job           varchar | null
  profilePath   varchar | null
  type          "cast" | "crew"
  order         integer
```

### `media_video`
```
media_video
  id            uuid PK
  mediaId       uuid FK → media (cascade)
  externalKey   varchar
  site          varchar
  name          varchar
  type          varchar
  official      boolean
  publishedAt   timestamp | null
```

### `media_watch_provider`
```
media_watch_provider
  id            uuid PK
  mediaId       uuid FK → media (cascade)
  providerId    integer
  providerName  varchar
  logoPath      varchar
  type          "stream" | "rent" | "buy"
  region        varchar
```

### `notification` (roadmap 5.3)
```
notification
  id            uuid PK
  title         varchar
  message       text
  type          varchar          ← "import_success" | "import_failed" | "download_complete" | "download_failed" | "upgrade" | "health_check"
  read          boolean default false
  mediaId       uuid FK → media (set null) | null
  createdAt     timestamp
```

### `blocklist` (roadmap 4.2)
```
blocklist
  id            uuid PK
  mediaId       uuid FK → media (cascade)
  title         varchar          ← release title
  indexer        varchar
  reason         varchar          ← "stalled" | "error" | "manual"
  createdAt     timestamp
```

### `quality_profile` (roadmap 3.1 — foundation)
```
quality_profile
  id            uuid PK
  name          varchar
  qualities     jsonb            ← ordered list: ["2160p Remux", "2160p WEB-DL", "1080p Blu-Ray", ...]
  cutoff        varchar          ← stop upgrading at this quality
  isDefault     boolean default false
  createdAt     timestamp
```

### Tabelas removidas
- `extrasCache`

### Campos adicionados na `media`
- `extrasUpdatedAt` timestamp | null
- `nextAirDate` date | null
- `qualityProfileId` uuid FK → quality_profile | null (roadmap 3.1)

---

## 9. Jobs BullMQ pós-refactor

### Continuam

| Queue | Schedule | Mudança |
|-------|----------|---------|
| `import-torrents` | A cada 2 min | + check `nextAirDate` + continuous download trigger |
| `reverse-sync` | A cada 5 min | Sem mudança |

### Novos

| Queue | Trigger | O que faz |
|-------|---------|-----------|
| `refresh-extras` | On library add + stale-while-revalidate | 1 call `append_to_response` → popula pool, credits, videos, watch providers |
| `download-images` | On persist | Baixa poster/backdrop/logo/still → filesystem |

### Removidos

| Queue | Motivo |
|-------|--------|
| `refresh-metadata` | Substituído por `refresh-extras` + `nextAirDate` |
| `cleanup-cache` | `extrasCache` não existe mais |

Handlers vivem em `application/jobs/`, chamam use cases do domain. `apps/worker/src/index.ts` fica só com setup.

---

## 10. Packages — o que muda

| Package | Hoje | Depois |
|---------|------|--------|
| `packages/api` | Routers monolíticos | `application/` + `domain/` + `infrastructure/` |
| `packages/providers` | TMDB/AniList providers | Pode migrar pra `infrastructure/adapters/` ou manter como package |
| `packages/db` | Schema + persist-media + settings | Schema + migrations (repositories migram pra `infrastructure/repositories/`) |
| `packages/validators` | Zod schemas | Fica como está |
| `apps/worker` | Jobs com lógica própria | Thin — só setup, handlers em `application/jobs/` |
| `apps/web` | Next.js frontend | Sem mudança |

---

## 11. Features do roadmap integradas ao refactor

### Entram de graça (consequência direta do refactor)

| Roadmap | Onde cai | Motivo |
|---------|---------|--------|
| **1.1** File naming com título da mídia | `domain/rules/naming.ts` → `buildFileName()` | Arquivo já sendo criado, adicionar título é 1 linha |
| **1.5** Rollback on import failure | `domain/use-cases/import-torrent.ts` | Use case já sendo reescrito — trackear `copiedFiles[]` + cleanup no catch |
| **1.6** Movie single-file validation | `domain/use-cases/import-torrent.ts` | Mesmo use case — validar `videoFiles.length === 1` antes de importar |
| **2.1** Import sweep independente de UI | Job `import-torrents` já existe e fica | Garantir que não depende de `listLive` |
| **2.2** Metadata refresh | Substituído pela refresh strategy (seção 6) | `nextAirDate` + stale-while-revalidate cobrem melhor |
| **7.4** Episode deduplication | `infrastructure/repositories/drizzle-media.ts` → `findEpisodeFile()` | Checar existência antes de inserir no repository |

### Entram com custo baixo (pequena extensão)

| Roadmap | Onde encaixar | Esforço |
|---------|--------------|---------|
| **1.2** Subtitle import | `import-torrent.ts` use case + `parsing.ts` rule | Detectar .srt/.ass/.sub, extrair idioma, renomear. ~50 loc |
| **2.3** Continuous download | `refresh-extras.ts` use case | Check nextAirDate já faz refresh. Adicionar `if (continuousDownload) → dispatch download` |
| **3.1** Quality profiles (foundation) | Nova tabela + `domain/rules/quality.ts` | Hierarquia já existe em `quality.ts`. Tabela + referência na media |
| **4.2** Failed download handling | `torrent-lifecycle.ts` use case + tabela `blocklist` | Stalled > X horas → marca falho → busca próximo excluindo blocklist |
| **5.3** In-app notifications | Tabela `notification` + port `NotificationRepositoryPort` | Port criado agora permite plugar providers (5.1-5.2) depois |

### Ficam de fora (features independentes)

| Roadmap | Motivo |
|---------|--------|
| **1.3** Archive extraction | Precisa de binários (7z, unrar) no Docker — mudança de infra |
| **1.4** Hardlink com fallback | Estratégia de import alternativa, opcional |
| **3.2** Decision engine | Feature grande, depende de 3.1 testado |
| **3.3** Automatic upgrades | Depende de 3.2 |
| **4.1** RSS sync | Independente, plugável via `IndexerPort` depois |
| **5.1-5.2** Multi-provider notifications | Plugável via `NotificationPort` depois |
| **6.1-6.2** Subtitle providers | Feature independente |
| **7.1-7.3** Import candidates, bulk import | Nice-to-have |
| **8.1** Usenet (SABnzbd) | `TorrentClientPort` já prepara a abstração |

---

## 12. Plano de execução

### Fase 1 — Fundação: domain + infrastructure (sem breaking changes)

Criar a estrutura de pastas e mover código puro. Nenhum router muda, tudo continua funcionando.

**1a. Estrutura + types + rules**
- Criar pastas `domain/`, `infrastructure/`, `application/`
- Mover types: criar `domain/types/` com interfaces extraídas do schema e providers
- Extrair `domain/rules/scoring.ts` ← `calculateConfidence()` do `torrent.ts`
- Extrair `domain/rules/parsing.ts` ← `parseSeasons()`, `parseEpisodes()`, `BARE_EP_PATTERN` do `torrent.ts`
- Extrair `domain/rules/quality.ts` ← `detectQuality()`, `detectSource()` do `torrent.ts`
- Extrair `domain/rules/naming.ts` ← `buildMediaDir()`, sanitize do worker + **adicionar título da mídia no filename** (roadmap 1.1)
- **Roadmap 3.1 foundation**: adicionar `qualityHierarchy` e tipo `QualityProfile` em `quality.ts`

**1b. Ports**
- Criar todas as interfaces em `domain/ports/`
- Nenhuma implementação ainda — só contratos

**1c. Cache Redis**
- Criar `infrastructure/cache/redis.ts` implementando `CachePort`
- Adicionar `ioredis` como dependência do `packages/api`

### Fase 2 — Adapters: extrair clients do monolito

- Extrair `infrastructure/adapters/qbittorrent.ts` ← classe `QBittorrentClient` do `torrent.ts`
- Extrair `infrastructure/adapters/prowlarr.ts` ← classe `ProwlarrClient` do `torrent.ts`
- Extrair `infrastructure/adapters/jackett.ts` ← classe `JackettClient` do `torrent.ts`
- Extrair `infrastructure/adapters/jellyfin.ts` ← lógica de `jellyfin.ts` router
- Extrair `infrastructure/adapters/plex.ts` ← lógica de `plex.ts` router
- Cada adapter implementa seu port
- `torrent.ts` importa dos adapters ao invés de definir as classes

### Fase 3 — Repositories: separar queries

- Criar `infrastructure/repositories/drizzle-media.ts` ← queries de `media.ts`, `persist-media.ts`
  - **Roadmap 7.4**: `findEpisodeFile()` com check de duplicata antes de insert
- Criar `infrastructure/repositories/drizzle-torrent.ts` ← queries de `torrent.ts`
- Criar `infrastructure/repositories/drizzle-library.ts` ← queries de `library.ts`
- Criar `infrastructure/repositories/drizzle-sync.ts` ← queries de `sync.ts`
- Criar `infrastructure/repositories/drizzle-settings.ts` ← queries de `settings.ts`
- Cada repository implementa seu port

### Fase 4 — Use cases: lógica sai dos routers

- Criar `domain/use-cases/import-torrent.ts` ← `autoImportTorrent()` do `torrent.ts` + worker
  - **Roadmap 1.2**: subtitle detection + import no mesmo use case
  - **Roadmap 1.5**: rollback com `copiedFiles[]` tracking
  - **Roadmap 1.6**: movie single-file validation
- Criar `domain/use-cases/search-torrents.ts` ← scoring + dedup + search
- Criar `domain/use-cases/download-torrent.ts` ← grab + placeholder creation
- Criar `domain/use-cases/torrent-lifecycle.ts` ← pause/resume/delete/merge
  - **Roadmap 4.2**: blocklist + auto-retry logic
- Criar `domain/use-cases/browse-media.ts` ← search + discover + trending unificados
- Criar `domain/use-cases/get-media-detail.ts` ← persist on visit + stale check
- Criar `domain/use-cases/manage-library.ts` ← add/remove + preferences
- Criar `domain/use-cases/sync-media-servers.ts` ← reverse sync
- Criar `domain/use-cases/manage-settings.ts` ← config + auth flows
- Criar `domain/use-cases/download-images.ts` ← image download logic
- Tornar routers thin — cada procedure vira 3-5 linhas

### Fase 5 — Novas tabelas + migrations

- Migration: criar `recommendation_pool`, `media_credit`, `media_video`, `media_watch_provider`
- Migration: criar `notification`, `blocklist`, `quality_profile`
- Migration: adicionar `extrasUpdatedAt`, `nextAirDate`, `qualityProfileId` na `media`
- Criar repositories: `drizzle-recommendation.ts`, `drizzle-notification.ts`, `drizzle-blocklist.ts`
- Criar `infrastructure/storage/filesystem-images.ts` implementando `ImageStoragePort`
- Criar `infrastructure/queue/bullmq-dispatcher.ts` implementando `JobDispatcherPort`

### Fase 6 — Recommendation pool + refresh strategy

- Implementar use case `refresh-extras.ts` (append_to_response → popular tabelas)
- Implementar use case `get-recommendations.ts` (spotlight, recommendations, similar)
- Implementar `application/jobs/refresh-extras.ts` (BullMQ handler)
- Implementar `application/jobs/download-images.ts` (BullMQ handler)
- Integrar refresh trigger no `import-torrents` job (nextAirDate check)
  - **Roadmap 2.3**: continuous download trigger no mesmo fluxo
- Integrar stale-while-revalidate no `get-media-detail` use case
- Aplicar cache Redis nos endpoints: `browse`, `filterOptions`, `filterSearch`, `getPerson`

### Fase 7 — Unificar endpoints + mover jobs

- Criar router `browse.ts` (media.browse + filterOptions + filterSearch)
- Matar endpoints antigos: `media.search`, `media.discover`, `provider.regions`, `provider.watchProviders`, `provider.networks`, `provider.companies`, `provider.spotlight`, `media.recommendations`
- Mover job handlers pra `application/jobs/`
- `apps/worker/src/index.ts` vira thin (só setup de queues)

### Fase 8 — Cleanup

- Dropar tabela `extrasCache`
- Remover job `cleanup-cache`
- Remover job `refresh-metadata`
- Remover key `cache.spotlight` da `systemSetting`
- Remover código morto dos routers antigos
- Migrar dados existentes do `extrasCache` para as novas tabelas (one-time script)

### Mapa visual

```
Fase 1 ─── domain/rules + types + ports + cache redis
            + roadmap 1.1 (file naming) + 3.1 foundation (quality hierarchy)

Fase 2 ─── infrastructure/adapters (extrair do monolito torrent.ts)

Fase 3 ─── infrastructure/repositories (separar queries)
            + roadmap 7.4 (episode dedup)

Fase 4 ─── domain/use-cases (lógica sai dos routers)
            + roadmap 1.2 (subtitles) + 1.5 (rollback) + 1.6 (movie validation)
            + roadmap 4.2 (blocklist) + 2.3 (continuous download)

Fase 5 ─── novas tabelas (pool, credits, videos, providers, notification, blocklist, quality_profile)

Fase 6 ─── recommendation pool + refresh strategy + image download + cache redis

Fase 7 ─── unificar endpoints + mover jobs pro application/

Fase 8 ─── cleanup (drop extrasCache, remove jobs mortos, migrate data)
```
