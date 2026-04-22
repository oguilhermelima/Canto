# Canto — Core Architecture Refactor Status

Status doc for the `packages/core` architecture overhaul. Tracks what landed on `main` and what still needs to happen.

**Last updated**: 2026-04-22
**Current `main` tip**: `17c7f6f1` (docs: consolidate refactor status at root)

---

## What was done (Phases 1-5, on `main`)

### Phase 1 — Prep + baseline + branch push ✅

- Branch `refactor/core-architecture` created and pushed to remote.
- `scripts/codemod/` workspace scaffolded (`@canto/codemod`, ts-morph based).
- `.codemod/` added to `.gitignore`.
- `test` task added to `turbo.json`.
- Baseline recorded: 10/10 typecheck green, 59/59 core tests green.

### Phase 2 — Build classification JSON ✅

- `scripts/codemod/src/plan/sample.json` committed with the full migration spec.
- Review flags resolved: `rss-matching`, `service-keys`, `validate-path` reclassified from inventory-DEAD to live code with correct context owners. `InvalidPathError` added to error assignments.
- `pnpm codemod verify --plan-only`: 0 structural findings; all 137 source paths verified present.

### Phase 3 — Implement codemod subcommands ✅

11 ts-morph subcommands under `scripts/codemod/src/subcommands/`, plus helpers (git safety, logger, ts-project, move-file, sibling-barrel, write-tsconfig, rewrite-imports, rewrite-cross-workspace). Commander CLI at `pnpm codemod <subcommand>`. Safety rails: dirty tree / branch mismatch / unpushed commits all refuse to run.

### Phase 4 — Execute scripted restructure ✅

- **4.1 split-errors**: `domain/errors.ts` split into per-context `errors.ts` files (shared, lists, torrents, user-media, file-organization).
- **4.2 classify-domain**: 41 moves from flat `domain/{rules,services,ports,types,mappers,constants}/` into per-context folders.
- **4.3 collapse-exports**: `packages/core/package.json` exports reduced from 34 entries to `"./*": "./src/*.ts"`.
- **4.4 restructure-infra**: 61 infra moves into `infra/<ctx>/` and `platform/<concern>/`; 16 legacy barrels deleted; transitional `infra/repositories.ts` aggregate created.
- **4.5 sibling-barrels**: every `<folder>/index.ts` → sibling `<folder>.ts`. `src/index.ts` emptied.
- **4.6 move-use-cases**: 102 files reparented from `domain/use-cases/<ctx>/` to `domain/<ctx>/use-cases/`.
- **4.7 rename-dirs**: empty `infrastructure/` and `lib/` removed.
- **4.8 add-tsconfig-paths**: `"@/*": ["./src/*"]` in every package/app tsconfig (9 total).
- **4.9 migrate-tilde-to-at**: 477 `~/*` → `@/*` rewrites in `apps/web/src`.

### Phase 5 — Verify ✅

- 10/10 typecheck green.
- 59/59 core tests green.
- Zero `@canto/core/infrastructure` or `@canto/core/lib` specifiers anywhere.
- Zero `from "~/"` in `apps/web/src` (was 477).
- Exactly 1 `index.ts` in `packages/core/src` (the root).

### Current shape of `packages/core/src/`

```
domain/
├── content-enrichment/ file-organization/ lists/ media/ media-servers/
├── notifications/ profile/ recommendations/ requests/ sync/ torrents/
├── trakt/ user/ user-media/
└── shared/         # DomainError, cross-context rules/services/ports/mappers
infra/
├── content-enrichment/ file-organization/ indexers/ lists/ media/
├── media-servers/ notifications/ profile/ recommendations/ requests/
├── shared/ torrent-clients/ torrents/ trakt/ user/ user-media/
└── repositories.ts   # transitional aggregate (Phase 6c deletes)
platform/
└── cache/ fs/ http/ logger/ queue/ secrets/ testing/
```

14 contexts + `shared/` in `domain/`. Per-context layout uses `rules/`, `services/`, `mappers/`, `constants/`, `types/`, `ports/`, `errors.ts`, `use-cases/` — which is the DDD taxonomy we now want to simplify.

---

## Phase 5.5 — Simplify structure (BLOCKS Phase 6)

**Why**: After living with the layout landed in Phase 4, two problems surfaced:

1. **Too many contexts**. 14 is a lot for a medium-size app, and some are more sub-concerns than bounded contexts:
   - `sync/` scans library from a media server — it's part of `media-servers`, not its own domain.
   - `file-organization/` manages folders where downloads land — it's part of `torrents` flow.
   - `user-media/` is the user's relationship with media (library, watch state, history) — it's user-centric.
   - `content-enrichment/` caches extras (credits, videos) — it's part of `media`'s lifecycle.
   - `profile/` holds user metadata (avatar, home sections) — it's part of `user`.

2. **DDD taxonomy is noise**. The sub-folder split (`rules/` vs `services/` vs `mappers/` vs `constants/`) doesn't pay for itself:
   - "rules" contains pure helpers. Not rules in the DDD sense — just functions.
   - "services" is a mixed bag; some are pure functions, some touch DB.
   - "mappers" belong in `infra/` (they bridge row ↔ domain), not in `domain/`.
   - "constants" can be inline or flat in `shared/`.

   Cleaner split: `types/`, `ports/`, `errors.ts`, `use-cases/`, with co-located helpers. Nothing else.

### Target layout

```
packages/core/src/domain/
├── media/                          # media + content-enrichment
│   ├── types.ts + types/           # entity, value types (one file per)
│   ├── ports.ts + ports/           # interfaces (one file per)
│   ├── errors.ts
│   └── use-cases/
│       ├── ensure-media.ts
│       ├── ...
│       └── _helpers.ts             # optional, cross-use-case helpers within this context
├── torrents/                       # torrents + file-organization
│   └── types/, ports/, errors.ts, use-cases/
├── user/                           # user + profile
│   └── types/, ports/, errors.ts, use-cases/
├── connections/                    # GROUP (not a context; pure navigational folder)
│   ├── media-servers/              # + sync folded in as use-cases
│   │   └── types/, ports/, errors.ts, use-cases/
│   └── trakt/
│       └── types/, ports/, errors.ts, use-cases/
├── user-actions/                   # GROUP (not a context)
│   ├── lists/
│   │   └── types/, ports/, errors.ts, use-cases/
│   ├── recommendations/
│   ├── user-media/                 # formerly user-media context
│   └── requests/
├── notifications/                  # standalone (system → user, different flow)
│   └── types/, ports/, errors.ts, use-cases/
└── shared/
    ├── errors.ts + errors/         # DomainError + cross-context errors
    ├── types.ts + types/
    ├── ports.ts + ports/
    └── <helper>.ts                 # flat files for cross-context utilities
                                    # (no rules/services/mappers/ subfolders)
```

**9 bounded contexts** + 2 meta-groups (`connections/`, `user-actions/`) + 1 `shared/`. Meta-groups are pure folders with no own types/ports/use-cases — each child is a full context.

### Sub-folder convention per context

- `types.ts` (sibling barrel) + `types/<entity>.ts` per entity/value-type. No god file.
- `ports.ts` (sibling barrel) + `ports/<port>.port.ts` per interface.
- `errors.ts` (or `errors.ts` + `errors/<error-class>.ts` folder if it grows).
- `use-cases/<feature>.ts` per use-case. Helpers inline or `_helpers.ts`.
- No `rules/`, `services/`, `mappers/`, `constants/`.

### What happens to removed folder kinds

- `rules/*.ts`: fold into `<ctx>/use-cases/_helpers.ts` if cross-use-case within the context; move to `shared/<name>.ts` if cross-context.
- `services/*.ts`: same treatment as rules.
- `mappers/*.ts`: move OUT of domain entirely. Go to `infra/<ctx>/<entity>.mapper.ts`. (Phase 7 already scoped this — just confirms direction.)
- `constants/*.ts`: inline or `shared/<name>-constants.ts`.

### Consolidation moves (per current → target)

| Current context | Becomes |
|---|---|
| `domain/content-enrichment/` | `domain/media/use-cases/` (merged) |
| `domain/sync/` | `domain/connections/media-servers/use-cases/` (merged) |
| `domain/media-servers/` | `domain/connections/media-servers/` (moved into group) |
| `domain/trakt/` | `domain/connections/trakt/` (moved into group) |
| `domain/file-organization/` | `domain/torrents/` (merged) |
| `domain/lists/` | `domain/user-actions/lists/` (moved into group) |
| `domain/recommendations/` | `domain/user-actions/recommendations/` |
| `domain/user-media/` | `domain/user-actions/user-media/` |
| `domain/requests/` | `domain/user-actions/requests/` |
| `domain/profile/` | `domain/user/use-cases/` (merged; profile features become user use-cases) |
| `domain/notifications/` | unchanged (standalone) |
| `domain/media/`, `domain/torrents/`, `domain/user/` | unchanged top level |

Infra side mirrors: `infra/content-enrichment/` → `infra/media/`, etc.

### Decisions pending before Phase 5.5 starts

These were raised and default-picked but need explicit confirmation:

1. **Meta-group naming**:
   - `connections/` (default, user-preferred) vs `integrations/` (slightly more idiomatic for "plugged-in external services").
   - `user-actions/` (default, user-preferred) vs `user-data/` vs `collections/`.
2. **`requests` placement**: under `user-actions/` (default — user initiates) vs standalone.
3. **`notifications` placement**: standalone (default — system-to-user) vs under `user-actions/`.
4. **`content-enrichment` vs `media`**: merge outright (default) vs keep as `domain/media/enrichment/` sub-concern.
5. **`sync` vs `media-servers`**: merge into `media-servers/use-cases/sync-*.ts` (default) vs keep as `media-servers/sync/` sub-folder.

### Execution plan

Mostly scriptable via the existing codemod with an updated `sample.json`. Remaining subcommands + one new one:

1. Update `sample.json` with the new move targets.
2. Run `classify-domain` (re-purposed) to move per-kind content into use-cases/_helpers.ts or shared/.
3. New subcommand `consolidate-contexts`: bulk reparent folders per the table above.
4. Run `sibling-barrels` again to produce sibling barrels for the new `types/`, `ports/`, etc. folders.
5. Run `verify` to assert the target shape.
6. Typecheck + tests must stay green.

**Est (Claude executing, not human)**: ~45-60 min of session time on branch `refactor/simplify-structure`. Codemod already has helpers for bulk moves + cross-workspace rewrites + sibling barrels; the new bits (consolidate-contexts subcommand, updated plan JSON, fold rules/services into helpers) are ~25 tool calls. Verification (typecheck + tests) adds ~3-5 cycles × ~15s each. One PR, no incremental merge — intermediate state too messy to ship.

**Non-goal**: any Phase 6 / 7 work. This is pure organizational reshuffle. Behavior unchanged.

---

## Phase 6 — Port-first refactor (BLOCKS Phase 8)

**Prereq**: Phase 5.5 complete.

**Why**: 7 composition-root files in `domain/` still import concrete adapters/repositories directly. Phase 8 ESLint requires zero `infra/*` or `platform/*` imports inside `domain/**`.

**Target**: every `domain/**` file imports only from `domain/**`, `@canto/db` (type-only), `@canto/providers`, `@canto/validators`, `zod`. The refactor-target files accept external functions via a `deps` argument; composition roots (`apps/worker/src/index.ts`, `packages/api/src/trpc.ts`) construct and inject.

### Phase 6a — Simple shared ports

- `domain/shared/ports/logger.port.ts` (`LoggerPort`: info/warn/error/debug + `logAndSwallow`).
- `domain/shared/ports/url-resolver.port.ts` (`URLResolverPort.followRedirects`).
- Extend `domain/shared/ports/job-dispatcher.port.ts`: add `dispatchMediaPipeline`, `dispatchEnsureMedia`.
- Adapters in `platform/{logger,http,queue}/` wrapping existing concrete functions.
- Refactor call sites in `domain/connections/media-servers/use-cases/sync-pipeline.ts`, `domain/media/use-cases/persist/*`, `domain/torrents/use-cases/download-torrent/core.ts` to accept `{ logger, urlResolver, jobDispatcher }` via deps.
- **Reach**: eliminates ~15 `platform/*` imports inside `domain/`.
- **Est (Claude)**: ~20-30 min. Small, self-contained. ~15 tool calls.

### Phase 6b — Media-server adapter ports

- `domain/connections/media-servers/ports/plex-adapter.port.ts` (≈ 9 methods).
- `domain/connections/media-servers/ports/jellyfin-adapter.port.ts` (≈ 7 methods).
- Adapter objects in `infra/media-servers/{plex,jellyfin}.adapter-bindings.ts` assembling the interface from existing concrete functions.
- Refactor the 6 media-server use-case files.
- **Reach**: eliminates ~14 `infra/media-servers/*.adapter` imports in `domain/`.
- **Est (Claude)**: ~25-35 min. Interfaces are boilerplate-heavy but mechanical. ~20 tool calls.

### Phase 6c — Per-context repository ports

- Create `domain/<ctx>/ports/<ctx>-repository.port.ts` per context that a domain file currently consumes.
- Minimum set after Phase 5.5:
  - `MediaRepositoryPort` (`domain/media/ports/`).
  - `TorrentsRepositoryPort` (`domain/torrents/ports/`).
  - `ListsRepositoryPort` (`domain/user-actions/lists/ports/`).
  - `UserMediaRepositoryPort` (`domain/user-actions/user-media/ports/`).
  - `FileOrganizationRepositoryPort` — may fold into `TorrentsRepositoryPort` since file-organization merges into torrents.
  - `MediaServersRepositoryPort` (`domain/connections/media-servers/ports/`).
  - `NotificationsRepositoryPort` — may not need a port; `notifications` is small and tight.
- Adapter files as thin spreads of existing functions.
- Refactor all refactor-target files to accept these ports via deps.
- **Delete `packages/core/src/infra/repositories.ts`** (transitional aggregate).
- **Reach**: `grep -r "from \"@/infra/\"" packages/core/src/domain` returns 0.
- **Est (Claude)**: ~40-60 min. Biggest of the three sub-phases — touches 11 files and the composition roots. ~35 tool calls.

---

## Phase 7 — Strict domain types + mappers

**Prereq**: Phase 6 complete.

**Why**: domain value-space still imports Drizzle types via `@canto/db`, including `import { ... } from "@canto/db/schema"` (value imports). Goal: zero `@canto/db` value imports inside `domain/**`.

### Per context (smallest first)

1. `notifications` (1 entity).
2. `user-actions/lists` (2 entities).
3. `connections/trakt` (1 entity).
4. `user-actions/requests` (1 entity).
5. `user-actions/recommendations` (1 entity).
6. `connections/media-servers` (1 entity + server-link).
7. `torrents` (includes file-organization entities: torrent, media-file, folder, library).
8. `user` (includes profile entities).
9. `user-actions/user-media` (9 methods across state, history, ratings, library, feed, stats, playback, hidden, profile-insights).
10. `media` (includes content-enrichment extras).

### Per context:

- Hand-write `domain/<ctx>/types/<entity>.ts` for every entity (branded IDs, enums, Dates).
- Hand-write `infra/<ctx>/<entity>.mapper.ts` with `toDomain(row)` and `toRow(entity)`.
- Update `infra/<ctx>/*-repository.ts` to call mapper at boundaries; signatures flip from row types to domain types.
- Update callers across `domain/`, `infra/`, `packages/api/`, `apps/*`.

**Est (Claude) per context**:
- Small (1-2 entities, no complex relationships): ~10-15 min. Applies to notifications, lists, trakt, requests, recommendations, media-servers.
- Medium (2-3 entities, some cross-type references): ~20-30 min. Applies to torrents (after file-organization merge), user (after profile merge).
- Large (many methods, dense query shapes): ~30-45 min. Applies to user-actions/user-media, media (after content-enrichment merge).

Total Phase 7: **~2.5-3.5 hours of session time** if done continuously. Safer to split across 2-3 sessions — typecheck failures in one context can cascade if callers aren't updated, and long sessions hit turn limits.

---

## Phase 8 — ESLint boundaries + CI

**Prereq**: Phase 6 complete. Phase 7 preferably complete.

- Add `tooling/eslint-config/core-boundaries.mjs` with `no-restricted-imports`:
  - `domain/**` may import: `domain/**`, `@canto/db` (type-only), `@canto/providers`, `@canto/validators`, `zod`.
  - `domain/**` may NOT import: `infra/*`, `platform/*`, `bullmq`, `ioredis`, `drizzle-orm`, `node:*`, `fetch`, `@trpc/server`, `next`, `react`.
  - `infra/**` may import: `domain/**`, `platform/**`, `@canto/db`, externals.
  - `platform/**` may import: externals only.
- Synthetic violation fixture at `packages/core/src/__eslint_fixtures__/should-fail.ts`; CI expects exit 1.
- Extend (or create) `.github/workflows/ci.yml` with `pnpm codemod verify`.

**Est (Claude)**: ~20-30 min. Mostly config writing + one smoke test. ~12 tool calls.

---

## Debt log (living on `main` today)

| Debt | Cleared by |
|---|---|
| 14 contexts with DDD-era subfolder layout (`rules/`, `services/`, `mappers/`, `constants/`) | Phase 5.5 |
| `domain/media/` + `content-enrichment/` separate; `sync/` vs `media-servers/`; `user-media/` standalone; `file-organization/` standalone | Phase 5.5 |
| `packages/core/src/infra/repositories.ts` transitional aggregate barrel | Phase 6c |
| `domain/**` files importing `@canto/core/infra/*.adapter` / `@canto/core/platform/*` directly | Phase 6a/b/c |
| `domain/**` files with value imports from `@canto/db/schema` or `drizzle-orm` | Phase 7 |
| No ESLint boundaries rule | Phase 8 |
| No CI workflow file | Phase 8 or later |

---

## Manual verification still pending

Auto mode has not booted dev servers. Before relying on `main` beyond typecheck:

- `rm -rf apps/web/.next && pnpm -F @canto/web dev` → boot on :3000; exercise `/lists`, `/media/[id]`, `/settings/services`.
- `pnpm -F @canto/worker dev` → pick up a synthetic job end-to-end.
- `pnpm -F @canto/web build` → Turbopack production build.

---

## How to resume

Each phase is an independent branch. **Run in this order**:

1. **Phase 5.5** — `refactor/simplify-structure`. Confirm the 5 decisions at the top of the Phase 5.5 section. Update `sample.json`. Run codemod. Single PR. ~45-60 min session time.

2. **Phase 6a** — `refactor/core-ports-shared`. LoggerPort + URLResolverPort + JobDispatcherPort extension. ~20-30 min.

3. **Phase 6b** — `refactor/core-ports-media-servers`. Plex + Jellyfin adapter ports. ~25-35 min.

4. **Phase 6c** — `refactor/core-ports-repositories`. Per-context repo ports + delete aggregate. ~40-60 min.

5. **Phase 7** — `refactor/core-strict-types-<ctx>`. One branch per context, smallest first. 10-45 min per context. Total ~2.5-3.5h session time continuous, or split across 2-3 sessions.

6. **Phase 8** — `chore/eslint-boundaries`. ESLint rules + CI. ~20-30 min.

**Total remaining work (Claude session time)**: ~5-7 hours aggregate. Realistically splits across 3-5 sessions because of turn/token limits and verify-cycle wait time (typecheck ~15s, tests ~3s per cycle; dozens of cycles accumulate).

**Reference**: Phase 1-5 were ~160 tool calls and roughly 2-3 hours of session time across one long session. The remaining phases together are roughly 2-3x that volume.

After each merge: `git checkout main && git pull`. Dirty / unpushed commits stop the codemod.
