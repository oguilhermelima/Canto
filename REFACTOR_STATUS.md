# Canto — Core Architecture Refactor Status

Status doc for the `packages/core` architecture overhaul. Tracks what landed on `main` and what still needs to happen.

**Last updated**: 2026-04-30 (revisado após auditoria crítica)
**Current `main` tip**: `2247e449` (fix(core): spotlight Path 3 — apply localization overlay on cache hit + by external triple)

---

## What was done

### Phase 1 — Prep + baseline + branch push ✅

- Branch `refactor/core-architecture` created and pushed.
- `scripts/codemod/` workspace scaffolded (`@canto/codemod`, ts-morph based).
- `.codemod/` added to `.gitignore`.
- `test` task added to `turbo.json`.

### Phase 2 — Build classification JSON ✅

- `scripts/codemod/src/plan/sample.json` committed with the full migration spec.
- Review flags resolved: `rss-matching`, `service-keys`, `validate-path` reclassified from inventory-DEAD to live code with correct context owners. `InvalidPathError` added to error assignments.
- `pnpm codemod verify --plan-only`: 0 structural findings.

### Phase 3 — Implement codemod subcommands ✅

11 ts-morph subcommands under `scripts/codemod/src/subcommands/`, plus helpers (git safety, logger, ts-project, move-file, sibling-barrel, write-tsconfig, rewrite-imports, rewrite-cross-workspace). Commander CLI at `pnpm codemod <subcommand>`. Safety rails: dirty tree / branch mismatch / unpushed commits all refuse to run.

### Phase 4 — Execute scripted restructure ✅

- **4.1 split-errors**: `domain/errors.ts` split into per-context `errors.ts` files.
- **4.2 classify-domain**: 41 moves from flat `domain/{rules,services,ports,types,mappers,constants}/` into per-context folders.
- **4.3 collapse-exports**: `packages/core/package.json` exports reduced from 34 entries to `"./*": "./src/*.ts"`.
- **4.4 restructure-infra**: 61 infra moves into `infra/<ctx>/` and `platform/<concern>/`; 16 legacy barrels deleted; transitional `infra/repositories.ts` aggregate created.
- **4.5 sibling-barrels**: every `<folder>/index.ts` → sibling `<folder>.ts`. `src/index.ts` emptied.
- **4.6 move-use-cases**: 102 files reparented from `domain/use-cases/<ctx>/` to `domain/<ctx>/use-cases/`.
- **4.7 rename-dirs**: empty `infrastructure/` and `lib/` removed.
- **4.8 add-tsconfig-paths**: `"@/*": ["./src/*"]` in every package/app tsconfig (9 total).
- **4.9 migrate-tilde-to-at**: 477 `~/*` → `@/*` rewrites in `apps/web/src`.

### Phase 5 — Verify ✅

Baseline at landing: 10/10 typecheck green, 59/59 core tests green, 0 `@canto/core/infrastructure` or `@canto/core/lib` specifiers, 0 `from "~/"` in `apps/web/src`.

### Phase 5.6 — Cadence engine + unified ensureMedia ✅ (unplanned, landed in this window)

Entre 2026-04-22 e 2026-04-30, uma sprint paralela colapsou o fanout per-aspect de enrichment em uma engine única. Não fazia parte do plano original mas reshaped o contexto `media/` significativamente.

- `domain/media/enrichment/` — strategy registry (`metadata`, `structure`, `translations`, `logos`, `extras`, `contentRatings`), `fire-call`, `topo-sort`, shared types.
- `domain/media/use-cases/cadence/` — pure-function planner (`compute-plan`, `aspect-state-writer`, knob loader). Seleciona o conjunto mínimo de aspects por chamada baseado em TTLs, dirty signals e gap reports.
- `domain/media/use-cases/ensure-media.ts` — entry point único. Substitui as legadas shells de worker `refreshExtras` / `reconcileShow` / `translateEpisodes` / `reprocessMedia`.
- Filas de worker `refreshExtras` e `translateEpisodes` deletadas; só `ensureMedia` + `mediaCadenceSweep` no fluxo de metadata.
- Localização migrada para single-query service (`shared/localization/localization-service.ts`); tabelas `*_translation` e colunas i18n base de media dropadas do schema.
- Admin UI para tunar knobs do cadence engine.
- `platform/concurrency/run-with-concurrency.ts` adicionado; perf no worker (paralelização de repack-supersede / folder-scan, batch de seed-management, exponential backoff em imports, batch resolve em reverse-sync, indexes em `download` / `downloadRequest` / `mediaFile`, partial indexes em `media.imdb_id` / `media.tvdb_id`).

**Side effects no plano de refactor**:
- `content-enrichment/` virou shim — `translate-episodes.ts`, `refresh-extras.ts`, `upsert-lang-logos.ts`, `sync-tmdb-certifications.ts` são funções biblioteca chamadas por strategies em `media/enrichment/`. Phase 5.5: merge óbvio em `media/`.
- `domain/profile/` e `domain/requests/` removidos completamente do domínio (sem lógica que sobreviveu; consumers vão direto pra `infra/profile/` e `infra/requests/`). Plano da Phase 5.5 não precisa mais consolidar esses.
- `media/use-cases/` cresceu (cadence/, persist/, fetch-logos.ts, detect-gaps.ts, resolve-media-version.ts, etc.) — Phase 7 surface bigger.

**Side effect contábil**: as strategies em `media/enrichment/strategies/` e os arquivos em `media/use-cases/cadence/`, `media/use-cases/persist/` adicionaram seus próprios imports diretos de `infra/*` e `platform/*` — os 158+51 imports atuais incluem estes. A engine de cadence em si (`cadence/compute-plan.ts`, `cadence/aspect-state-writer.ts`) é pure-function e não viola, mas tudo que orquestra ela ainda está acoplado.

### Current shape of `packages/core/src/`

```
domain/                                 # 12 contexts + shared
├── content-enrichment/  file-organization/  lists/  media/
├── media-servers/  notifications/  recommendations/  shared/
├── sync/  torrents/  trakt/  user/  user-media/
infra/                                  # 16 ctx folders (+ profile, requests, indexers, torrent-clients)
├── content-enrichment/  file-organization/  indexers/  lists/  media/
├── media-servers/  notifications/  profile/  recommendations/  requests/
├── shared/  torrent-clients/  torrents/  trakt/  user/  user-media/
└── repositories.ts                     # transitional aggregate (Phase 6c deletes)
platform/
└── cache/  concurrency/  fs/  http/  logger/  queue/  secrets/  testing/
```

Per-context layout ainda usa taxonomia DDD (`rules/`, `services/`, `mappers/`, `constants/`, `types/`, `ports/`, `errors.ts`, `use-cases/`) — **o ruído que Phase 5.5 limpa**. `shared/ports/` já tem 6 ports definidos, mas só `JobDispatcherPort` é consumido (2 call sites). Os outros 5 são bypass-eados.

**Tests**: 144 (143 passing, 1 skipped). Era 59 no baseline da Phase 5.

---

## Phase 5.5 — Simplify structure (BLOCKS Phase 6)

**Why**: contextos demais, ruído de subfolder DDD. Com 5.6 já colapsando o fluxo de metadata, escopo da 5.5 ficou mais apertado — `content-enrichment/` virou alvo claro de merge em vez de debate.

### Tabela de consolidação revisada

| Current context | Becomes | Justificativa |
|---|---|---|
| `domain/content-enrichment/` | `domain/media/use-cases/` | Já é shim de strategies. Zero coesão própria. |
| `domain/sync/` | `domain/media-servers/scans/` | Infra-shaped (5 arquivos, 1612 LOC, sem subfolder `use-cases/` próprio). `use-cases/` confunde naming. |
| `domain/file-organization/` | `domain/torrents/` | Coupling bidirectional já existe (`file-organization/rules` importa `torrents/rules/parsing`). |
| `domain/lists/` | `domain/user-actions/lists/` | Mantém `user-actions/`. |
| `domain/recommendations/` | `domain/user-actions/recommendations/` | Mantém `user-actions/`. |
| `domain/user-media/` | `domain/user-actions/user-media/` | Mantém `user-actions/`. |
| `domain/media-servers/` | **unchanged top-level** | Sem `connections/`. |
| `domain/trakt/` | **unchanged top-level** | Sem `connections/`. |
| `domain/notifications/` | unchanged | Standalone (system → user). |
| `domain/media/`, `domain/torrents/`, `domain/user/` | unchanged top level | |
| `domain/profile/`, `domain/requests/` | — | Já gone (5.6 side effect). |

**Resultado**: 10 contextos top-level + 1 meta-grupo (`user-actions/`) + `shared/`.

**Por que não criar `connections/`** (originalmente proposto agrupando `media-servers/` + `trakt/`): zero coesão funcional. `media-servers/` faz auth/scan de Plex/Jellyfin (servidor → conteúdo). `trakt/` sincroniza watchlist/history do usuário com serviço externo (usuário → estado). Ambos têm acoplamento ZERO entre si (auditado). Pelo critério "fala com serviço externo", `indexers/` e `torrent-clients/` também entrariam — sintoma de label vago.

**Por que manter `user-actions/`**: existe DAG real entre os 3 children. `lists/` alimenta `recommendations/`; `recommendations/` consome state de `user-media/`. Cohesão funcional + 5273 LOC + 41 use-cases = paga o nesting. Reforçar com ESLint depois para impedir importação reversa.

### Convenção de subfolder por contexto (sem mudança)

- `types.ts` (sibling barrel) + `types/<entity>.ts` por entity. Sem god file.
- `ports.ts` (sibling barrel) + `ports/<port>.port.ts` por interface.
- `errors.ts` (ou folder `errors/` se crescer).
- `use-cases/<feature>.ts` por use-case. Helpers inline ou `_helpers.ts`.
- **Sem** `rules/`, `services/`, `mappers/`, `constants/`.

### Pra onde vai o conteúdo dos folders DDD

- `rules/*.ts`: para `<ctx>/use-cases/_helpers.ts` (cross-use-case dentro do ctx) ou `shared/<name>.ts` (cross-context).
- `services/*.ts`: igual.
- `mappers/*.ts`: para fora do domain. Para `infra/<ctx>/<entity>.mapper.ts` — Phase 7 owns.
- `constants/*.ts`: inline ou `shared/<name>-constants.ts`.

### Decisões pendentes

1. **`user-actions/` vs alternativas**: `user-actions/` (default) vs `user-data/` / `collections/`.
2. **`content-enrichment` vs `media`**: merge outright (default — strategies já moram em `media/enrichment/`).
3. **`sync` rename**: `media-servers/scans/` (default) vs `media-servers/sync/`.

### Plano de execução

1. Atualizar `sample.json` com novos targets (drop linhas de profile/requests, drop `connections/`, ajustar sync→scans).
2. Rodar `classify-domain` (re-purposed) pra dobrar conteúdo de `rules/`/`services/` em use-cases ou `shared/`.
3. Novo subcommand `consolidate-contexts`: bulk reparent de folders.
4. Rodar `sibling-barrels` de novo pros novos folders `types/`, `ports/`.
5. Rodar `verify` pra confirmar shape alvo.
6. Typecheck + tests (10/10 + 144) tem que ficar verde.

**Est (Claude session time)**: ~75-90 min em branch `refactor/simplify-structure`. ~30 tool calls. One PR.

**Non-goal**: nada de Phase 6 / 7. Reshuffle organizacional puro.

---

## Phase 6 — Port-first refactor (BLOCKS Phase 8)

**Prereq**: Phase 5.5 completa.

**Estado dos ports hoje**:

> Em `domain/shared/ports/`: 6 ports definidos (`cache.ts`, `download-client.ts`, `file-system.port.ts`, `job-dispatcher.port.ts`, `media-provider.port.ts`, `media-server.port.ts`). Só `JobDispatcherPort` é consumido por call sites reais (2 ocorrências em `domain/trakt/coordinator.ts` e `domain/media/use-cases/reconcile-show-structure.ts`). Os outros 5 estão definidos mas bypass-eados — código chama direto de `platform/*` e `infra/*`.
>
> **Implicação**: Phase 6a começa **conectando o que já existe**, não criando ports novos. LoggerPort e URLResolverPort entram, mas o ganho maior está em fazer ~25 call sites passarem a usar `MediaProviderPort`, `FileSystemPort`, `DownloadClientPort` etc.

**Estado real do acoplamento** (re-medido 2026-04-30):

- **158 imports** de `infra/*` em `domain/**` atravessando **94 arquivos**.
- **51 imports** de `platform/*` em `domain/**` atravessando **32 arquivos**.
- 1 port per-context já existe: `domain/torrents/ports/indexer.ts`.

**Target**: todo arquivo `domain/**` importa só de `domain/**`, `@canto/db` (type-only), `@canto/providers`, `@canto/validators`, `zod`. Composition roots (`apps/worker/src/index.ts`, `packages/api/src/trpc.ts`) constroem adapters e injetam via `deps`.

### Phase 6a — Wireup ports compartilhadas + LoggerPort/URLResolverPort

- Criar `domain/shared/ports/logger.port.ts` (`LoggerPort`: info/warn/error/debug + `logAndSwallow`).
- Criar `domain/shared/ports/url-resolver.port.ts` (`URLResolverPort.followRedirects`).
- Estender `job-dispatcher.port.ts` com novas operações conforme necessário.
- Adapters em `platform/{logger,http,queue}/` envolvendo funções concretas atuais.
- **Wireup das 5 ports já definidas mas bypass-eadas** — fazer use cases atuais passarem a consumir `MediaProviderPort` (em vez de `getTmdbProvider`/`getTvdbProvider`), `FileSystemPort`, `DownloadClientPort`, `MediaServerPort`, `CachePort`.
- Refatorar ~13 call sites: `connections/media-servers/use-cases/sync-pipeline.ts`, `media/use-cases/persist/*`, `torrents/use-cases/download-torrent/core.ts`, `lists/use-cases/manage-list-items.ts`, recommendation use-cases etc.
- **Reach**: elimina ~25 dos 51 imports `platform/*`.
- **Est**: ~25-30 min. ~18 tool calls.

### Phase 6b — Media-server adapter ports

- `domain/media-servers/ports/plex-adapter.port.ts` (≈ 9 métodos).
- `domain/media-servers/ports/jellyfin-adapter.port.ts` (≈ 7 métodos).
- Adapter objects em `infra/media-servers/{plex,jellyfin}.adapter-bindings.ts` montando a interface a partir das funções concretas.
- Refatorar 7 use-case files (`update-metadata`, `discover-libraries`, `trigger-scans`, authenticate/{plex,jellyfin,trakt}, fetch-info/{plex,jellyfin}, sync-libraries/{plex,jellyfin}, services/user-connection-service).
- Inclui surfacing do TMDB/TVDB provider port em `trakt/use-cases/shared.ts`.
- **Reach**: elimina ~30 dos 158 imports `infra/*` + ~15 dos platform.
- **Est**: ~30-40 min. ~25 tool calls.

### Phase 6c — Per-context repository ports

- Criar `domain/<ctx>/ports/<ctx>-repository.port.ts` por contexto.
- Set mínimo após 5.5:
  - `MediaRepositoryPort` (cobre content-enrichment após merge).
  - `TorrentsRepositoryPort` (cobre file-organization após merge).
  - `ListsRepositoryPort`.
  - `UserMediaRepositoryPort` (maior — 20+ métodos).
  - `MediaServersRepositoryPort` (cobre sync após merge).
  - `RecommendationsRepositoryPort`.
  - `TraktRepositoryPort`.
  - `NotificationsRepositoryPort` — pequeno; avaliar durante execução.
  - `UserRepositoryPort`.
- Adapter files como spreads finos das funções existentes.
- Refatorar arquivos restantes do domain pra aceitar ports via `deps`.
- Converter 7 imports `typeof schema.X` value para type-only via codemod (small win).
- **Deletar `packages/core/src/infra/repositories.ts`** (aggregate transitional, 56 consumers).
- **Reach**: drives `infra/*` count em `domain/` para 0.
- **Est**: ~90-150 min. Maior das três sub-phases — toca ~80 arquivos + composition roots. ~50 tool calls.

### Phase 6c.5 — ESLint warn gate (BLOCKS Phase 7 sangria)

Após 6c terminar, antes da Phase 7 começar:

- Adicionar regra `no-restricted-imports` em modo `warn` (não `error`) no `tooling/eslint/base.js` (ou em config dedicado pra `packages/core`):
  - `domain/**` não pode importar `infra/*`, `platform/*`, `bullmq`, `ioredis`, `drizzle-orm`, `node:*`, `@trpc/server`, `next`, `react`.
- Não bloqueia merge — apenas torna visível qualquer regressão durante Phase 7.
- Promovido a `error` no fim da Phase 7 (parte da Phase 8).
- **Est**: ~5-10 min.

---

## Phase 7 — Strict domain types + mappers

**Prereq**: Phase 6 completa.

**Estado real**: **53** db value imports em `domain/**` (32 de `@canto/db/schema`, 21 de `@canto/db/settings` etc.), **34** imports `drizzle-orm`.

**Why**: domain value-space ainda importa Drizzle row types via `@canto/db/schema`. Goal: zero `@canto/db` value imports em `domain/**`. Type-only imports OK.

### Por contexto (calibrado contra `packages/db/src/schema.ts`)

| Contexto | Entidades reais | Métodos repo aprox | Bucket |
|---|---|---|---|
| `notifications` | 1 (`notification`) | ~4 | Pequeno |
| `user-actions/lists` | 2 (`list`, `listMember`) | ~8 | Pequeno |
| `user-actions/recommendations` | 2 (`userRecommendation`, `becauseWatched`) | ~6 | Pequeno |
| `media-servers` | 1 (`userConnection`) | ~5 | Pequeno |
| `user` | 2 (`user`, `userPreference`) | ~5 | Pequeno |
| `trakt` | 1 dominante + ~5 tabelas de suporte | ~10 | Médio |
| `torrents` (pós file-org merge) | 5 (`download`, `mediaFile`, `mediaVersion`, `downloadFolder`, `folderMediaPath`) | ~15 | Médio |
| `user-actions/user-media` | 8 (`userMediaState`, `userPlaybackProgress`, `userMediaRating`, `userMediaHidden`, `userMediaLibrary`, `userMediaLibraryFeed`, `userMediaStats`, `profileInsights`) | ~20 | Grande |
| `media` (pós content-enrichment merge) | 10+ (`media`, `season`, `episode`, `mediaLocalization`, `mediaAspectState`, `mediaContentRating`, `tmdbCertification`, `mediaFile`, `mediaVersion`, watch-providers, extras) | ~25 | Grande |

### Por contexto

- Hand-write `domain/<ctx>/types/<entity>.ts` para cada entity (branded IDs, enums, Dates).
- Hand-write `infra/<ctx>/<entity>.mapper.ts` com `toDomain(row)` e `toRow(entity)`.
- Update `infra/<ctx>/*-repository.ts` pra chamar mapper nas fronteiras; signatures viram domain types.
- Update callers atravessando `domain/`, `infra/`, `packages/api/`, `apps/*`.

### Estimativa por bucket (recalibrado)

- **Pequeno** (1-2 entidades, ~5-8 métodos): **15-20 min** cada (era 10-15). 5 contextos × 17min = ~85min.
- **Médio** (5 entidades, ~15 métodos): **35-45 min** cada. 2 contextos × 40min = ~80min.
- **Grande** (8-10+ entidades, 20+ métodos): **60-80 min** cada. 2 contextos × 70min = ~140min.

Total Phase 7: **~4-5 horas** de session time (era 2.5-3.5h). Realisticamente split em 2-3 sessões.

---

## Phase 8 — ESLint boundaries + CI

**Prereq**: Phase 6 completa. Phase 7 preferivelmente completa.

- Promover regras da Phase 6c.5 de `warn` para `error`:
  - `domain/**` pode importar: `domain/**`, `@canto/db` (type-only), `@canto/providers`, `@canto/validators`, `zod`.
  - `domain/**` NÃO pode importar: `infra/*`, `platform/*`, `bullmq`, `ioredis`, `drizzle-orm`, `node:*`, `fetch`, `@trpc/server`, `next`, `react`.
  - `infra/**` pode importar: `domain/**`, `platform/**`, `@canto/db`, externals.
  - `platform/**` pode importar: externals only.
- Synthetic violation fixture em `packages/core/src/__eslint_fixtures__/should-fail.ts`; CI espera exit 1.
- Estender (ou criar) `.github/workflows/ci.yml` com `pnpm codemod verify`.

**Est**: ~25-30 min. ~12 tool calls.

---

## Phase 9 — Lint hardening + zero warnings

**Prereq**: nenhum. Pode rodar em paralelo com 5.5/6/7 ou após Phase 8. **Recomendação**: rodar Phase 9b (bugs hooks) AGORA — bugs em produção não esperam.

### Estado atual (auditado 2026-04-30)

- **ESLint só roda em `apps/web`**. `apps/worker`, `packages/api`, `packages/core`, `packages/auth`, `packages/db`, `packages/ui`, `packages/providers`, `packages/validators`, `scripts/codemod` — NENHUM tem `eslint.config.js` nem script `lint`. Turbo task `lint --continue` cobre 1 de 9 packages.
- **`apps/web` tem 138 problemas** (1 erro + 137 warnings) com config atual já permissiva.
- **Build emite 144 warnings**, dos quais ~12 são bugs reais:
  - `react-hooks/rules-of-hooks`: `useMemo` em condicional (2 ocorrências).
  - `react-hooks/refs` "Cannot access refs during render": 10+ ocorrências.
  - `react-hooks/exhaustive-deps`: 5+ deps que mudam todo render.
- Override em `apps/web/eslint.config.js` rebaixa 11 regras importantes pra `warn` ou `off` com comment "soft-fail categories of pre-existing debt".

### Phase 9a — Espalhar ESLint para todos os packages (~30-45 min)

Adicionar `eslint.config.js` + script `"lint": "eslint ."` em:
- `apps/worker`, `packages/api`, `packages/core`, `packages/auth`, `packages/db`, `packages/ui`, `packages/providers`, `packages/validators`, `scripts/codemod`.

Cada um estende `@canto/eslint-config/base` (+ `react.js` em `packages/ui` se houver JSX). Esperar que o primeiro `pnpm lint` mostre dezenas/centenas de novas violações latentes — esse é o ponto.

### Phase 9b — Fixar bugs reais de react-hooks em apps/web (~90-120 min)

Bugs (não estilo). Tratar como prioridade:
- `react-hooks/rules-of-hooks`: 2 ocorrências, `useMemo` em condicional. Refatorar para hooks no topo.
- `react-hooks/refs` "Cannot access refs during render": 10+ ocorrências. Mover acesso a `.current` para `useEffect` ou event handlers.
- `react-hooks/exhaustive-deps`: 5+ ocorrências de deps que mudam todo render. Wrap com `useMemo`/`useCallback`.

### Phase 9c — Auto-fix + sweep dos warnings restantes (~120-180 min)

1. `pnpm lint --fix` — resolve ~31 warnings auto-fixáveis (`consistent-type-specifier-style`, `consistent-type-imports`).
2. Sweep manual:
   - `no-unnecessary-condition`: ~30 ocorrências. Remover guards mortos.
   - `no-unused-vars`: poucos. Prefixar com `_` ou deletar.
   - `no-img-element`: substituir `<img>` por `<Image />` do next/image.
   - `no-explicit-any`: substituir por `unknown` + narrowing (CLAUDE.md já proíbe `any`).
3. Repetir build até zero warnings.

### Phase 9d — Promover regras para `error` + remover exceções (~30-45 min)

Editar `tooling/eslint/base.js` e `apps/web/eslint.config.js`:

| Regra | Atual | Alvo |
|---|---|---|
| `@typescript-eslint/no-unused-vars` | error / **warn (web)** | error |
| `@typescript-eslint/no-unnecessary-condition` | error / **warn (web)** | error |
| `@typescript-eslint/no-misused-promises` | error / **warn (web)** | error |
| `@typescript-eslint/no-explicit-any` | recommended (warn) | **error** |
| `@typescript-eslint/consistent-type-imports` | warn / warn | error |
| `import-x/consistent-type-specifier-style` | error / **warn (web)** | error |
| `react-hooks/exhaustive-deps` | warn | error |
| `react-hooks/rules-of-hooks` | warn | error |
| `react-hooks/refs` | warn | error |
| `react-hooks/immutability` | warn | error |
| `react-hooks/preserve-manual-memoization` | warn | error |
| `react-hooks/set-state-in-effect` | **off** | warn (deferir error) |
| `@next/next/no-img-element` | warn | error |

Adicionar regras strict novas em `tooling/eslint/base.js`:
- `@typescript-eslint/no-floating-promises: "error"` (pega promises não-awaitadas)
- `@typescript-eslint/await-thenable: "error"`
- `@typescript-eslint/no-non-null-assertion: "error"` (banir `!`)
- `@typescript-eslint/prefer-nullish-coalescing: "error"` (`??` vs `||`)
- `@typescript-eslint/no-unnecessary-type-assertion: "error"`
- `eqeqeq: ["error", "always"]`
- `no-console: ["warn", { allow: ["warn", "error"] }]` (warn por enquanto)

Remover comment "soft-fail categories of pre-existing debt" do `apps/web/eslint.config.js`.

### Phase 9e — Adicionar lint:strict task no Turbo (~10 min)

`turbo.json`:
- Tornar `lint` task dependente de `^topo`.
- Garantir `cache` válido + `outputs: [".cache/.eslintcache"]` em todos os packages.
- Adicionar `lint:strict` que falha se houver qualquer warning (`--max-warnings=0`) — usar em CI.

### Phase 9f — Build limpo (~30-60 min)

Após 9b/c, rodar `pnpm -F @canto/web build` e fixar qualquer warning residual emitido pelo Next/Turbopack. Hoje há 144 warnings de build — alvo: zero.

**Total Phase 9**: ~5-8 horas de session time. Realistic split em 2 sessões:
- Sessão 1: 9a + 9b (espalhar lint, fixar bugs hooks). ~3h.
- Sessão 2: 9c + 9d + 9e + 9f (sweep, hardening, build). ~4h.

---

## Debt log (living on `main` today)

| Debt | Cleared by |
|---|---|
| 12 contextos com layout DDD-era (`rules/`, `services/`, `mappers/`, `constants/`) | Phase 5.5 |
| `domain/content-enrichment/` (now thin shim) separado de `media/`; `sync/` separado de `media-servers/`; `file-organization/` separado de `torrents/` | Phase 5.5 |
| `packages/core/src/infra/repositories.ts` aggregate barrel transitional (56 consumers) | Phase 6c |
| 158 imports `infra/*` + 51 imports `platform/*` em `domain/**` | Phase 6a/b/c |
| 5 de 6 ports compartilhadas definidas mas bypass-eadas | Phase 6a (wireup) |
| 53 imports value `@canto/db` + 34 imports `drizzle-orm` em `domain/**` | Phase 7 |
| Sem regra ESLint impedindo violações novas em `domain/**` | Phase 6c.5 (warn) + Phase 8 (error) |
| ESLint só roda em `apps/web` (1 de 9 packages) | Phase 9a |
| 138 lint problems + 144 build warnings em `apps/web` | Phase 9b/c/f |
| 11 regras importantes em modo `warn` ou `off` | Phase 9d |
| Sem `lint:strict` task no Turbo / CI | Phase 9e |
| Sem CI workflow file | Phase 8 |

---

## Manual verification still pending

Auto mode não bootou dev servers desde pré-5.6. Antes de confiar no `main` além de typecheck:

- `rm -rf apps/web/.next && pnpm -F @canto/web dev` → boot em :3000; exercitar `/lists`, `/media/[id]`, `/settings/services`, página nova de admin cadence-knobs.
- `pnpm -F @canto/worker dev` → exercitar `ensureMedia` end-to-end (cadence sweep deve planejar + dispatch corretamente; verificar `media_aspect_state` rows updated).
- `pnpm -F @canto/web build` → Turbopack production build.

---

## How to execute — Plano em Waves

**Ideia central**: cada wave é **autocontida e shippable**. Slice vertical através das phases (6+7+9-do-contexto) em vez de varrer phase-por-phase. Pode parar entre waves sem deixar funcionalidade quebrada.

Phase numbers (5.5, 6, 7, 8, 9) ficam acima como **referência** do que cada bucket de trabalho contém. Waves são a **ordem de execução**.

Critério de "wave fechada":
- Typecheck verde (`pnpm typecheck` 10/10).
- Tests verdes (`pnpm -F @canto/core test` + qualquer outro afetado).
- Build verde se afetou apps/web.
- ESLint sem violações novas no contexto da wave.
- PR mergeável independente.

---

### Wave 0 — Bootstrap (cross-cutting, ~3-4h)

Trabalho que tem que vir antes das waves de contexto, ou que é global e não cabe em wave de domínio.

#### 0A — Lint coverage everywhere (~30 min)
- Adicionar `eslint.config.js` + script `"lint": "eslint ."` em 9 packages: `apps/worker`, `packages/{api,core,auth,db,ui,providers,validators}`, `scripts/codemod`.
- Cada um estende `@canto/eslint-config/base` (+ `react.js` em `packages/ui` se houver JSX).
- Não fixa warnings ainda — só liga visibilidade. Esperar 100s de violações no primeiro run.

#### 0B — Bugs react-hooks em apps/web (~90 min) **PRIORIDADE**
- `react-hooks/rules-of-hooks` (2x): `useMemo` em condicional → mover hooks pro topo.
- `react-hooks/refs` "Cannot access refs during render" (10+x): mover `.current` pra `useEffect`/handlers.
- `react-hooks/exhaustive-deps` (5+x): wrap deps com `useMemo`/`useCallback`.
- **São bugs reais em produção**. Pode rodar antes mesmo de 0A.

#### 0C — Phase 5.5 codemod (~60 min)
- Codemod move folders: `content-enrichment→media`, `sync→media-servers/scans`, `file-organization→torrents`, `lists/recommendations/user-media→user-actions/`.
- Drop subfolders DDD em favor de `types/`, `ports/`, `use-cases/`.
- Após: shape novo, código velho. Próximas waves limpam código contexto-por-contexto.

#### 0D — Shared ports wireup (~25 min)
- Cria `LoggerPort`, `URLResolverPort` em `domain/shared/ports/`.
- Wireup das 5 ports já definidas mas bypass-eadas (`MediaProviderPort`, `FileSystemPort`, `DownloadClientPort`, `MediaServerPort`, `CachePort`) — ~13 call sites switchados pra usar a interface.
- Composition roots (`apps/worker/src/index.ts`, `packages/api/src/trpc.ts`) constroem adapters.

**Estado pós-Wave 0**: shape novo da Phase 5.5, lint everywhere, bugs hooks zero, shared ports wired. 4 PRs (um por sub-wave) ou bundle.

---

### Waves 1-9 — Per-context vertical slices

Cada wave faz para **um contexto**:
1. Cria `domain/<ctx>/ports/<ctx>-repository.port.ts` + adapter binding em `infra/<ctx>/`.
2. Cria types branded em `domain/<ctx>/types/<entity>.ts`.
3. Cria mappers em `infra/<ctx>/<entity>.mapper.ts` (`toDomain` / `toRow`).
4. Refatora use-cases pra aceitar `deps` (repo, logger, etc).
5. Elimina imports `infra/*` e `platform/*` dentro de `domain/<ctx>/`.
6. Converte imports `@canto/db/schema` desse contexto pra type-only.
7. Limpa lint warnings nos arquivos do contexto.
8. Update consumers (API routers, worker handlers, outros contextos).

**Ordem: menor primeiro, maior por último.** Permite iteração rápida + aprende o pattern em contextos pequenos antes dos densos.

#### Wave 1 — `notifications` (~25-30 min)
1 entity (`notification`), ~4 methods. Standalone (system → user). Ensaio do pattern de wave.

#### Wave 2 — `user` (~25-30 min)
2 entities (`user`, `userPreference`), ~5 methods. Pequeno, sem fan-out.

#### Wave 3 — `user-actions/lists` (~30-40 min)
2 entities (`list`, `listMember`), ~8 methods. Coupling com recommendations (próxima wave) — deixa port de recommendations pendente, lists usa adapter trivial.

#### Wave 4 — `user-actions/recommendations` (~30-40 min)
2 entities (`userRecommendation`, `becauseWatched`), ~6 methods. Consome state de user-media via port (Wave 7); até lá, adapter trivial sobre função existente.

#### Wave 5 — `media-servers` + scans (~45-60 min)
1 entity dominante (`userConnection`), ~5 methods + scanners (sync code agora dentro). Inclui Phase 6b (Plex + Jellyfin adapter ports — ~9 + 7 métodos cada). Wave mais bursty.

#### Wave 6 — `trakt` (~45-60 min)
1 entity dominante + ~5 supporting tables, ~10 methods. Fluxos de sync (history, ratings, favorites, watched, watchlist, custom-lists) — densos mas mecânicos.

#### Wave 7 — `user-actions/user-media` (~75-90 min)
8 entities (`userMediaState`, `userPlaybackProgress`, `userMediaRating`, `userMediaHidden`, `userMediaLibrary`, `userMediaLibraryFeed`, `userMediaStats`, `profileInsights`), ~20 methods. Wave grande. **Considerar split**: 7A (state + history + ratings) e 7B (library + feed + stats + playback + hidden + insights).

#### Wave 8 — `torrents` + file-organization (~60-75 min)
5 entities (`download`, `mediaFile`, `mediaVersion`, `downloadFolder`, `folderMediaPath`), ~15 methods. `IndexerPort` já existe. Coupling bidirectional com file-org agora interno ao contexto.

#### Wave 9 — `media` + content-enrichment + cadence (~90-120 min)
**Maior contexto**. 10+ entities (`media`, `season`, `episode`, `mediaLocalization`, `mediaAspectState`, `mediaContentRating`, `tmdbCertification`, `mediaFile`, `mediaVersion`, watch-providers, extras), ~25 methods. Inclui content-enrichment shims, cadence engine, strategies, persist subfolders. **Split recomendado**:
- 9A: media core (`media`/`season`/`episode` + repos + types).
- 9B: localization + aspect-state.
- 9C: extras + watch-providers + content-enrichment shims.

Tests da cadence engine devem cobrir bem — refatoração não pode regredir lógica de planejamento.

---

### Wave Final — Lockdown (~90-120 min)

Após Waves 1-9 todas verdes:

- **Phase 8** ESLint boundaries em modo `error` (era warn). Adicionar `no-restricted-imports`:
  - `domain/**` não pode importar `infra/*`, `platform/*`, `bullmq`, `ioredis`, `drizzle-orm`, `node:*`, `@trpc/server`, `next`, `react`.
  - Synthetic violation fixture em `packages/core/src/__eslint_fixtures__/should-fail.ts`.
- **Phase 9c sweep**: warnings residuais que tightening de tipos não resolveu.
- **Phase 9d**: promover ~13 regras de `warn` pra `error` em `tooling/eslint/base.js` + `apps/web/eslint.config.js`. Adicionar `no-floating-promises`, `await-thenable`, `no-non-null-assertion`, `prefer-nullish-coalescing`, `eqeqeq`, `no-unnecessary-type-assertion`.
- **Phase 9e**: turbo `lint:strict --max-warnings=0`.
- **Phase 9f**: `pnpm -F @canto/web build` com zero warnings.
- **Delete `infra/repositories.ts`** (último consumer caiu na Wave 9).
- **CI workflow** `.github/workflows/ci.yml` rodando typecheck + test + lint:strict.

---

### Total

| Bloco | Estimativa |
|---|---|
| Wave 0 (bootstrap) | 3-4h |
| Waves 1-9 (contextos) | 7-9h agregado |
| Wave Final (lockdown) | 1.5-2h |
| **Total realista** | **~12-15h** |

PRs: 4 da Wave 0 + 9 das waves de contexto + 1 lockdown = **~14 PRs** mergeáveis independentemente. Pode parar a qualquer momento entre waves.

**Após cada wave**: `git checkout main && git pull`. Codemod precisa tree limpa.
