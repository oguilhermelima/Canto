# Canto — Core Architecture Refactor Status

Status doc for the `packages/core` architecture overhaul. Tracks what landed on `main` and what still needs to happen.

**Last updated**: 2026-04-22
**Current `main` tip**: `f3e1e1b8` (merge of `refactor/core-architecture`)

---

## What was done

### Phase 1 — Prep + baseline + branch push ✅

- Branch `refactor/core-architecture` created and pushed to remote.
- `scripts/codemod/` workspace scaffolded (`@canto/codemod`, ts-morph based).
- `.codemod/` added to `.gitignore`.
- `test` task added to `turbo.json`.
- Baseline recorded: 10/10 typecheck green, 59/59 core tests green.

### Phase 2 — Build classification JSON ✅

- `scripts/codemod/src/plan/sample.json` committed with the full migration spec:
  - 14 bounded contexts
  - 49 domain classifications
  - 11 use-case folder moves
  - 19 error class assignments
  - 61 infra moves
  - 16 legacy barrels to delete
  - 6 new ports + 1 extended
  - 3 composition roots + 11 refactor targets
- Review flags resolved: `rss-matching`, `service-keys`, `validate-path` reclassified from inventory-DEAD to live code with correct context owners. `InvalidPathError` added to error assignments.
- `pnpm codemod verify --plan-only`: 0 structural findings; all 137 source paths verified present.

### Phase 3 — Implement codemod subcommands ✅

Under `scripts/codemod/src/`:

- **Plan**: Zod-validated `schema.ts` + `load.ts` + `sample.json`.
- **Helpers**: `git` (safety rails), `logger` (per-run `.codemod/<ts>/{run.log,summary.md}`), `ts-project` (ts-morph Project per package), `move-file` (SourceFile.move wrapper), `sibling-barrel` (folder/index.ts → folder.ts), `write-tsconfig` (JSON-C merge), `rewrite-imports` (prefix + exact matchers), `rewrite-package-json`, `rewrite-cross-workspace` (rewrites `@canto/core/<old>` → `@canto/core/<new>` across other workspace packages).
- **Subcommands**: `split-errors`, `classify-domain`, `restructure-infra`, `rename-dirs`, `sibling-barrels`, `collapse-exports`, `add-tsconfig-paths`, `migrate-tilde-to-at`, `move-use-cases`, `generate-domain-types`, `generate-mapper-skeletons`, `verify`.
- **CLI**: Commander-based, single binary (`pnpm codemod <subcommand>`). Auto-detects monorepo root.
- **Safety**: every mutating subcommand refuses to run unless tree is clean, branch matches plan, and branch is remote-tracked with no unpushed commits.

### Phase 4 — Execute scripted restructure ✅

Done in 9 pushed commits:

- **4.1** `split-errors`: `domain/errors.ts` split into `domain/shared/errors.ts` + `domain/<ctx>/errors.ts` for lists, torrents, user-media, file-organization.
- **4.2** `classify-domain`: 41 moves from `domain/{rules,services,ports,types,mappers,constants}/` into context folders; 3 legacy barrel deletes; sync barrel renamed to sibling.
- **4.3** `collapse-exports` (done together with 4.2): `packages/core/package.json` exports reduced from 34 enumerated entries to single `"./*": "./src/*.ts"` wildcard.
- **4.4** `restructure-infra`: 61 infra file moves into `infra/<ctx>/` and `platform/<concern>/`; 16 legacy barrels deleted; transitional `infra/repositories.ts` aggregate created.
- **4.5** `sibling-barrels`: 13 `<folder>/index.ts` files converted to sibling `<folder>.ts`. Root `src/index.ts` emptied.
- **4.6** `move-use-cases`: 102 files reparented from `domain/use-cases/<ctx>/` to `domain/<ctx>/use-cases/`. Orphan test relocated. `trakt` orchestrator restored with corrected paths.
- **4.7** `rename-dirs`: empty `packages/core/src/{infrastructure,lib}/` shells removed.
- **4.8** `add-tsconfig-paths`: `"@/*": ["./src/*"]` added to every `packages/*/tsconfig.json` + `apps/*/tsconfig.json` (9 tsconfigs).
- **4.9** `migrate-tilde-to-at`: 477 `~/*` → `@/*` rewrites across 198 files in `apps/web/src`; legacy `~/*` alias removed from `apps/web/tsconfig.json`.

### Phase 5 — Verify ✅

- `pnpm turbo run typecheck`: 10/10 green.
- `pnpm -F @canto/core test`: 59/59 green (baseline preserved).
- `grep @canto/core/infrastructure OR @canto/core/lib`: 0 hits anywhere.
- `grep from "~/" apps/web/src`: 0 hits (was 477).
- `find packages/core/src -name index.ts`: exactly 1 (`src/index.ts`).

### Result shape

`packages/core/src/` now looks like:

```
domain/
├── content-enrichment/ file-organization/ lists/ media/
├── media-servers/ notifications/ recommendations/ sync/
├── torrents/ trakt/ user/ user-media/
└── shared/         # DomainError, cross-context rules/services/ports/mappers
infra/
├── content-enrichment/ file-organization/ indexers/ lists/
├── media/ media-servers/ notifications/ profile/ recommendations/
├── requests/ shared/ torrent-clients/ torrents/ trakt/ user/ user-media/
└── repositories.ts   # transitional aggregate (Phase 6 deletes)
platform/
└── cache/ fs/ http/ logger/ queue/ secrets/ testing/
```

Every package/app exposes `@/*` → `./src/*`. Adding a new bounded context is `mkdir src/domain/<name>/` — zero package.json edits.

---

## What still needs to happen

### Phase 6 — Port-first refactor (blocks Phase 8)

**Why**: 7 composition-root files in `domain/` still import concrete adapters/repositories directly, via the transitional `src/infra/repositories.ts` aggregate plus direct imports from `platform/` and `infra/`. Phase 8 ESLint boundaries rule requires zero `infra/*` or `platform/*` imports inside `domain/**`.

**Target**: every `domain/**` file imports only from `domain/**` and `@canto/db` (type-only). The 11 refactor targets accept all external functions via a `deps` argument; composition roots (`apps/worker/src/index.ts`, `packages/api/src/trpc.ts`) construct the deps and inject.

**Proposed split into sub-phases** (each ≈ 1-3 hours, one branch each):

#### Phase 6a — Simple shared ports

- Create `domain/shared/ports/logger.port.ts` (`LoggerPort`: info/warn/error/debug + `logAndSwallow`).
- Create `domain/shared/ports/url-resolver.port.ts` (`URLResolverPort.followRedirects`).
- Extend `domain/shared/ports/job-dispatcher.port.ts`: add `dispatchMediaPipeline`, `dispatchEnsureMedia`.
- Adapters in `platform/logger/`, `platform/http/`, `platform/queue/` (one new `.adapter.ts` each, wrapping the existing concrete function).
- Refactor call sites in `domain/sync/sync-pipeline.ts`, `domain/media/use-cases/persist/{core,extras}.ts`, `domain/torrents/use-cases/download-torrent/core.ts` to accept `{ logger, urlResolver, jobDispatcher }` via deps.
- Composition roots pass the deps.
- Expected reach: eliminates ~15 `platform/` imports in `domain/`.

#### Phase 6b — Media-server adapter ports

- Create `domain/media-servers/ports/plex-adapter.port.ts` (≈ 9 methods: authenticateServerToken, checkTvPin, createTvPin, getServerResource, getTvUser, signIn, testConnection, fetchItemWithMedia, fetchShowLeavesWithMedia).
- Create `domain/media-servers/ports/jellyfin-adapter.port.ts` (≈ 7 methods).
- Adapter objects in `infra/media-servers/{plex,jellyfin}.adapter-bindings.ts` that assemble the interface from the existing concrete functions (no code duplication — they just spread/rename).
- Refactor `domain/media-servers/use-cases/{authenticate,fetch-info,sync-libraries}/{plex,jellyfin}.ts` (6 files) to accept the port via deps.
- Expected reach: eliminates ~14 `infra/media-servers/*.adapter` imports in `domain/media-servers/use-cases/`.

#### Phase 6c — Per-context repository ports

- Create per-context repository ports under `domain/<ctx>/ports/<ctx>-repository.port.ts`. Minimum set based on current aggregate usage:
  - `MediaRepositoryPort` (findByExternalId, findByAnyReference, findByIdWithSeasons, update, createMediaVersionEpisodes, deleteMediaVersionEpisodesByVersionId, upsertMediaVersion, createMediaFile, deleteMediaFilesByTorrentId, findMediaFilesByTorrentId).
  - `TorrentsRepositoryPort` (findByTitle, findByHash, create, update, delete, findBlocklistEntry).
  - `ListsRepositoryPort` (addListItem, reconcileServerLibrary).
  - `UserMediaRepositoryPort` (addToUserMediaLibrary).
  - `FileOrganizationRepositoryPort` (findFolderById, findDefaultFolder, ensureServerLibrary).
  - `MediaServersRepositoryPort` (findServerLink, upsertServerLink).
  - `NotificationsRepositoryPort` (insertNotification) — already a clean domain target; may not need a port at all.
- Port adapter files live in `infra/<ctx>/<ctx>-repository.adapter.ts` as thin spreads of the existing function exports.
- Refactor 11 use-case files to accept these ports via deps.
- **Delete `packages/core/src/infra/repositories.ts`** — the transitional aggregate. All symbols now reachable through specific adapters.
- Expected reach: eliminates the last domain→infra imports. `grep -r "from \"@/infra/\"" packages/core/src/domain` returns 0.

**Non-goal for Phase 6**: changing the _types_ domain exchanges (still uses Drizzle `InferSelectModel`). That's Phase 7.

### Phase 7 — Strict domain types + mappers

**Why**: domain value-space today imports Drizzle types via `@canto/db` (mostly as `import type`, which is safe, but in several files `import { ... } from "@canto/db/schema"` leaks the value). Goal: zero `@canto/db` value imports inside `domain/**`; `import type { ... } from "@canto/db/schema"` is permitted only at the boundary where a type flows from infra to domain.

**Per context** (recommended order — smallest first so the pattern solidifies before harder cases):

1. `notifications` (1 entity, 1 repo method).
2. `lists` (2 entities: list, list-member).
3. `trakt` (1 entity: trakt-sync-state).
4. `profile` (2 entities: profile-section, home-section).
5. `recommendations` (1 entity: user-recommendation).
6. `requests` (1 entity).
7. `media-servers` (1 entity: user-connection + server-link).
8. `file-organization` (2 entities: folder, library).
9. `torrents` (2 entities: torrent, media-file-via-torrent).
10. `user-media` (9 methods across state, history, ratings, library, feed, stats, playback-progress, hidden, profile-insights).
11. `user` (1 entity).
12. `content-enrichment` (extras cache).
13. `media` (3 entities: media, media-version, media-file).

Each context:

- Hand-write `domain/<ctx>/types.ts` (branded IDs where applicable, enums, Dates where the row stores timestamps).
- Hand-write `infra/<ctx>/<entity>.mapper.ts` (`toDomain(row): Entity` and `toRow(entity): InferInsertModel`).
- Update `infra/<ctx>/*-repository.ts` to call `toDomain` on read, `toRow` on write; signatures flip from row types to domain types.
- Update every caller across `domain/`, `infra/`, `packages/api/`, `apps/*`.

**Non-goal**: creating domain types for every Drizzle helper type (pagination envelopes, raw SQL row shapes). Keep pragmatic.

### Phase 8 — ESLint boundaries + CI

**Prerequisites**: Phase 6 fully complete, Phase 7 preferably complete (can partially enforce with Phase 7 ongoing if a context allowlist is acceptable — it isn't per earlier decision).

**Work**:

- Add `tooling/eslint-config/core-boundaries.mjs` with `no-restricted-imports` patterns:
  - `domain/**` may only import `domain/**`, `@canto/db` (type-only), `@canto/providers`, `@canto/validators`, `zod`.
  - `domain/**` may not import `infra/*`, `platform/*`, `@canto/core/infra/*`, `@canto/core/platform/*`, `bullmq`, `ioredis`, `drizzle-orm`, `node:*`, `fetch`, `@trpc/server`, `next`, `next/*`, `react`, `react-dom`.
  - `infra/**` may import `domain/**`, `platform/**`, `@canto/db`, `@canto/providers`, externals.
  - `platform/**` may import externals only.
- Add a synthetic violation fixture at `packages/core/src/__eslint_fixtures__/should-fail.ts` (excluded from tsc) and a CI step that runs ESLint against it and expects exit 1.
- Extend `.github/workflows/ci.yml` (new file — can piggyback on Phase 9 or land separately) with `pnpm codemod verify` as a job.

---

## How to resume

Each Phase 6 / Phase 7 sub-phase is independent once its predecessor lands:

1. `git checkout main && git pull`
2. `git switch -c <branch>` — e.g. `refactor/core-ports-6a`, `refactor/core-strict-types-lists`.
3. Do the focused work (see per-phase scope above).
4. Verify: `pnpm turbo run typecheck && pnpm turbo run test`.
5. `git push -u origin <branch>`, open PR, review, merge `--no-ff`.

The codemod still works — `pnpm codemod generate-domain-types --context <ctx>` and `pnpm codemod generate-mapper-skeletons --context <ctx>` scaffold Phase 7 stubs. `pnpm codemod verify` catches regressions.

---

## Debt log (transitional state living on `main` today)

These are known, documented debts. Each one has a Phase that eliminates it:

- `packages/core/src/infra/repositories.ts` — aggregate barrel re-exporting every repo. Domain orchestrations still consume it. **Phase 6c** deletes it.
- `domain/**` files importing `@canto/core/infra/*.adapter` / `@canto/core/platform/*` directly — **Phases 6a/b/c**.
- `domain/**` files with `import { ... } from "@canto/db/schema"` or `from "drizzle-orm"` (value imports) — **Phase 7**.
- No ESLint boundaries rule yet — **Phase 8**.
- No CI workflow file yet — **Phase 8** or deferred.

---

## Manual verification still pending

Auto mode does not boot dev servers. Before relying on `main` beyond typecheck:

- `rm -rf apps/web/.next && pnpm -F @canto/web dev` → boot on :3000; exercise `/lists`, `/media/[id]`, `/settings/services`.
- `pnpm -F @canto/worker dev` → pick up a synthetic job end-to-end.
- `pnpm -F @canto/web build` → Turbopack production build.

---

## Branches tied to this refactor (current state)

- `main` (= `origin/main`): `f3e1e1b8 Merge branch 'refactor/core-architecture'`. Contains Phase 1-5.
- No other live branches tied to this work. Previous `refactor/core-architecture` and `refactor/core-ports` were merged/abandoned and deleted.

All future Phase 6 / 7 / 8 work starts from `main` on its own branch.
