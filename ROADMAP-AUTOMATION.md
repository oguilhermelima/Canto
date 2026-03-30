# Roadmap: Automation Engine

O que falta pro Canto ter um pipeline de automação equivalente ao Sonarr/Radarr, integrado na UX que já temos.

---

## 1. Quality Profiles

Hoje o usuário escolhe manualmente qual torrent baixar. Não existe conceito de "qualidade aceitável" nem hierarquia.

### O que construir

- Tabela `quality_profile` com nome e lista ordenada de qualidades aceitas
- Hierarquia padrão: `SD < 720p < 1080p WEB-DL < 1080p Blu-Ray < 2160p WEB-DL < 2160p Remux`
- **Cutoff**: qualidade a partir da qual para de fazer upgrade (ex: se cutoff é 1080p Blu-Ray, não busca 4K)
- Qualidades agrupáveis (ex: WEB-DL e WEBRip 1080p são equivalentes)
- Profile atribuído por mídia ou por library (default da library, override por mídia)
- UI em Settings para criar/editar profiles
- Na busca de torrent, o profile filtra automaticamente os resultados — mostra só o que é aceito, destaca o que é ideal

### Impacto

- `packages/db/src/schema.ts` — nova tabela `quality_profile` + `quality_profile_item`
- `packages/api/src/routers/library.ts` — CRUD de profiles, atribuição a libraries
- `apps/web/src/app/(app)/settings/page.tsx` — UI de gestão de profiles
- `packages/api/src/routers/torrent.ts` — filtro de resultados baseado no profile ativo
- `apps/web/src/app/(app)/media/[id]/page.tsx` — indicar no torrent search quais resultados atendem o profile

---

## 2. Decision Engine (Release Scoring)

Hoje os resultados de busca são ordenados por confidence score básico (seeders + qualidade + source). Não existe scoring granular nem custom formats.

### O que construir

- **Custom Formats**: regras regex que tagueiam releases com atributos
  - Condições: título (regex), codec (x265/x264/AV1), áudio (Atmos/DTS-HD/AAC), HDR (DV/HDR10+), grupo de release, tamanho, flags do indexer (freeleech)
  - Cada custom format recebe um score numérico no quality profile (ex: +150 pra HEVC, +100 pra Atmos, -200 pra hardcoded subs)
- **Scoring total**: quality tier base + soma dos custom format scores = score final do release
- O release com maior score é o preferido (grab automático ou destaque no manual search)
- **Rejection reasons**: no interactive search, mostrar por que um release foi rejeitado (qualidade fora do profile, tamanho excede limite, formato penalizado)

### Impacto

- `packages/db/src/schema.ts` — tabelas `custom_format`, `custom_format_condition`, `profile_format_score`
- `packages/api/src/routers/torrent.ts` — scoring engine aplicado nos resultados de search
- `apps/web/src/app/(app)/media/[id]/page.tsx` — torrent search dialog mostra score e rejection reasons
- `apps/web/src/app/(app)/settings/page.tsx` — UI de custom formats (criar regras, atribuir scores nos profiles)

---

## 3. Automatic Upgrades

Hoje se o usuário baixou uma versão 720p e depois aparece uma 1080p, nada acontece automaticamente.

### O que construir

- Job periódico `upgrade-check` no worker (BullMQ repeatable, ex: a cada 6h)
- Para cada mídia monitorada com arquivo abaixo do cutoff do quality profile:
  1. Busca nos indexers
  2. Passa pelo decision engine
  3. Se encontrou release com score melhor que o atual → grab automático
  4. Ao completar, substitui o arquivo antigo (mesmo flow do replace que já existe)
  5. Notifica Jellyfin/Plex
- Setting global pra habilitar/desabilitar upgrades automáticos
- Setting por mídia pra opt-out individual
- Log de upgrades no histórico

### Impacto

- `apps/worker/src/jobs/upgrade-check.ts` — **NOVO** — job que varre mídia abaixo do cutoff
- `packages/db/src/schema.ts` — campo `upgrade_allowed` na media, `upgrade_history` table
- `packages/api/src/routers/torrent.ts` — reusar `search` + decision engine + `download`/`replace`
- `apps/web/src/app/(app)/settings/page.tsx` — toggle global de auto-upgrade
- Preferences modal da mídia — toggle de auto-upgrade por título

---

## 4. RSS Sync (Background Monitoring)

Hoje o `continuous_download` busca novos episódios, mas não existe polling contínuo dos indexers pra conteúdo novo/melhor.

### O que construir

- Job `rss-sync` no worker (BullMQ repeatable, a cada 15min configurável)
- Flow:
  1. Fetch RSS feeds de todos os indexers configurados (Prowlarr expõe RSS endpoints)
  2. Parse cada release (título → qualidade, source, season, episode)
  3. Match contra mídia monitorada (in_library = true)
  4. Passa pelo decision engine
  5. Se release é aceito e melhor que o atual → grab automático
  6. Se release é pra episódio novo que ainda não existe → criar episódio + grab
- **Delay profiles** (opcional, fase 2): segurar o grab por X horas pra esperar releases melhores
- Dashboard de atividade: mostrar o que o RSS sync encontrou, grabou, rejeitou

### Impacto

- `apps/worker/src/jobs/rss-sync.ts` — **NOVO** — job principal de polling
- `packages/api/src/routers/torrent.ts` — adaptar `search` pra aceitar RSS results (já parseados)
- `packages/db/src/schema.ts` — tabela `rss_sync_history` pra log de atividade
- `packages/api/src/routers/settings.ts` — config de intervalo do RSS sync
- `apps/web/src/app/(app)/settings/page.tsx` — config de RSS sync (intervalo, toggle)
- Activity page ou section mostrando histórico do RSS sync

---

## 5. Failed Download Handling

Hoje se um torrent falha (stalled, sem seeds, arquivo corrompido), fica no estado "incomplete" ou "error" e o usuário precisa intervir manualmente.

### O que construir

- **Blocklist**: quando um download falha, o release é adicionado a uma blocklist (por hash ou título+indexer)
- **Auto-retry**: ao detectar falha, buscar automaticamente o próximo melhor release (que não está na blocklist)
  1. Torrent fica stalled por mais de X horas → marca como falho
  2. Remove do qBittorrent
  3. Busca nos indexers novamente
  4. Decision engine exclui releases na blocklist
  5. Grab o próximo melhor
- **Retry limit**: máximo de tentativas antes de desistir (default: 3)
- **Blocklist management**: UI pra ver e limpar blocklist
- **Health check notifications**: alertar quando algo falha repetidamente

### Impacto

- `packages/db/src/schema.ts` — tabela `blocklist` (release_title, indexer, hash, reason, created_at)
- `apps/worker/src/jobs/import-torrents.ts` — detectar stalled/failed, trigger retry
- `packages/api/src/routers/torrent.ts` — lógica de auto-retry com blocklist, CRUD da blocklist
- `apps/web/src/app/(app)/settings/page.tsx` — UI de blocklist management
- `apps/web/src/app/(app)/torrents/page.tsx` — indicar quando um torrent é retry automático

---

## Ordem sugerida de implementação

| Fase | Feature | Justificativa |
|------|---------|---------------|
| 1 | Quality Profiles | Base pra tudo — sem profiles, não dá pra automatizar decisões |
| 2 | Decision Engine | Usa os profiles pra scoring — permite melhor seleção manual e prepara pra automação |
| 3 | Failed Download Handling | Quick win — melhora a experiência atual sem precisar de automação completa |
| 4 | RSS Sync | Automação real — polling contínuo, grab automático |
| 5 | Automatic Upgrades | Cereja do bolo — depende de tudo acima funcionando |
