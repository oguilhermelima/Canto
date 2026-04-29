# Media Enrichment Refactor — Session Notes

A multi-phase refactor of how Canto fetches, persists, and exposes per-language media metadata. Replaces 5 parallel enrichment flows with a single orchestrator (`ensureMedia`) backed by a state machine, a strategy registry, and a unified localization layer with single-query reads.

This document captures everything that shipped in the session and every follow-up item that was deliberately deferred. It exists so future work can pick up cold without re-deriving the design.

---

## Why this refactor existed

### The pain we solved

1. **Worker CPU at ~37% sustained.** Worker was running TypeScript via `tsx`, so every boot transpiled the whole tree on the fly and an `esbuild --service` subprocess sat resident. Combined with a duplicated `reverse-sync` cron (jellyfin and plex schedules both walked every connection), CPU stayed pegged.

2. **Three parallel enrichment flows for one concept.** `runMediaPipeline`, `ensureMedia`, and standalone `refreshExtras` all did some version of "make this media's data current." Each had its own dispatchers, its own retry rules, its own cadence. Same media was refreshed multiple times by independent code paths.

3. **No completion state per aspect.** `media` had two `*_updated_at` timestamp columns. Anything that returned empty (TVDB has no `pt-BR` for this show) was retried forever — `detectGaps` looked at row counts, saw zero, and dispatched another fetch. Negative responses were not cached.

4. **`pt-PT` content showed when `pt-BR` was selected.** The fallback in `applyMediaTranslation` was a single layer: "if translation row exists, use it; else base." When a media had no `pt-BR` row, the resolver did not gracefully fall back to `en-US` — it returned the base, which was already populated by an earlier `pt-PT` fetch in some cases. English fallback was hardcoded as "language starts with 'en'".

5. **Localization data was scattered across tables and helpers.** `mediaTranslation`, `seasonTranslation`, `episodeTranslation` each had their own readers (`applyMediaTranslation`, `applySeasonsTranslation`, `translateMediaItems`, `translateEpisodeTitlesForItems`, `batchMediaTranslations`). Five readers, three tables, two layers (base + translation). Writers did the same dance in reverse.

6. **No notion of "fetched and confirmed empty"** vs "never fetched." Every cron tick treated both as "needs fetch."

### The shape we settled on

- One source of truth for per-language data: `media_localization` / `season_localization` / `episode_localization`. Reads always supply a language, and the resolver issues one SQL with two LEFT JOINs (user-lang and en-US) plus `COALESCE` per field. Fallback chain is fixed: `requested → en-US`. No deeper chain.
- One source of truth for "what has been done to this media": `media_aspect_state`, keyed by `(media_id, aspect, scope)`. Tracks `last_attempt_at`, `succeeded_at`, `outcome`, `next_eligible_at`, `attempts`, `consecutive_fails`, `materialized_source`.
- One orchestrator: `ensureMedia(db, mediaId, spec, providers?)`. Reads state, calls `computePlan` (cadence engine), groups required API calls by capability, fires each call once, distributes results to per-aspect strategies, writes outcomes back.
- One strategy per aspect: `metadata`, `structure`, `extras`, `translations`, `logos`, `contentRatings`. Each is a single function module under `packages/core/src/domain/media/enrichment/strategies/`. Registered exhaustively in `Record<Aspect, MediaEnrichmentStrategy>`.
- One cron sweep: `media-cadence-sweep` every 24h. Reads `findEligibleMediaIds(...)`, dispatches `ensureMedia(id)` per result. Replaces `backfill-extras`.

---

## What shipped (15 commits, on `main`)

In execution order:

| # | Commit | Phase |
|---|---|---|
| 1 | `chore(infra): run worker on Bun in production` | Bun runtime |
| 2 | `fix(worker): scope reverse-sync to its cron's provider` | Reverse-sync dedup |
| 3 | `feat(db): add media_aspect_state and *_localization tables` | 1A + 1B schema |
| 4 | `feat(core): media aspect-state repository` | 1A repo |
| 5 | `feat(core): single-query localization service with en-US fallback` | 1B service |
| 6 | `feat(core): idempotent backfills for aspect-state and localization` | 1A + 1B backfills |
| 7 | `chore(worker): wire aspect-state and localization backfills at boot` | 1A + 1B wire |
| 8 | `feat(core): cadence engine pure functions for media enrichment planning` | 2-α |
| 9 | `feat(core): drive ensure-media off cadence engine + smart aspect-state seed` | 2-β |
| 10 | `feat(core): migrate localization reads/writes to single-query service` | 1C-β + 1C-γ |
| 11 | `fix(core): swap tvdb-overlay reads to *_localization` | tvdb-overlay pair fix |
| 12 | `feat(core+worker): collapse media enrichment to single ensureMedia + cadence sweep` | 3 + 4 |
| 13 | `feat(db): drop legacy *_translation tables and dual-write paths` | 1C-δ (partial) |

(Earlier in the session there were also two infra commits: switching the worker runtime to Bun and a `.dockerignore` cleanup. Counted above.)

---

## Architecture as it stands

### Schema

```
media                       -- structural + base i18n columns (kept for now; see pending #1)
media_aspect_state          -- (media_id, aspect, scope) state machine
media_localization          -- (media_id, language) per-language text + assets
season_localization         -- (season_id, language)
episode_localization        -- (episode_id, language)
```

`media_aspect_state` columns:
- `media_id`, `aspect`, `scope` (PK)
- `last_attempt_at`, `succeeded_at`, `outcome` (`data | empty | partial | error_4xx | error_5xx`)
- `next_eligible_at` (driven by cadence engine)
- `attempts`, `consecutive_fails`
- `materialized_source` (used for `aspect='structure'` to detect TMDB↔TVDB migration needs)

Localization tables:
- `media_localization.title` is `NOT NULL` — every row has a title.
- All other text/asset columns are nullable.
- Writers use `ON CONFLICT DO UPDATE SET title = EXCLUDED.title, overview = COALESCE(EXCLUDED.overview, media_localization.overview), ...` — partial payloads do not clobber unrelated fields.

Migration files:
- `0034_flawless_winter_soldier.sql` — creates the four new tables.
- `0035_amused_plazm.sql` — drops the three legacy `*_translation` tables.

### Data flow

```
                         ┌─────────────────────────────────┐
                         │ dispatchEnsureMedia(id, spec?)  │
                         │ (single dispatch entry point)   │
                         └────────────┬────────────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────────────┐
              cron sweep │  Worker: enrichMedia handler    │ on-demand
              (every 24h)│  → ensureMedia(...)             │ (router, sync, scan)
                         └────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────────────┐
                  │  ensureMedia (orchestrator, ~186 LOC)          │
                  │  1. loadMediaContext + loadCadenceKnobs        │
                  │  2. findAspectStates                           │
                  │  3. computePlan(state, ctx, signal, knobs)     │
                  │  4. coalesce strategies by API capability      │
                  │  5. fireCall (one per capability, parallel)    │
                  │  6. topo-sort plan items by dependsOn          │
                  │  7. for each item: strategy.applyToAspect(...)  │
                  │  8. writeAspectState (outcome + next_eligible) │
                  └────────────────────────────────────────────────┘
```

### The 6 strategies

Each lives in `packages/core/src/domain/media/enrichment/strategies/` and exports a single `MediaEnrichmentStrategy` constant.

| Aspect | `needs` | `dependsOn` | What it persists |
|---|---|---|---|
| `metadata` | `tmdb.metadata` | `[]` | Base media row + en-US localization row |
| `structure` | `tmdb.metadata` or `tvdb.metadata` | `['metadata']` | Seasons + episodes; handles source-migration drop+reseed when `materialized_source` mismatches `effectiveProvider` |
| `extras` | `tmdb.extras` | `['metadata']` | mediaCredit, mediaVideo, mediaWatchProvider, mediaRecommendation |
| `translations` | `tmdb.metadata` (media-level) + `tvdb.episodeTranslations` (episode-level fallback) | `['structure']` | mediaLocalization, seasonLocalization, episodeLocalization rows for non-en languages |
| `logos` | `tmdb.images` | `['metadata']` | logoPath on per-language localization rows |
| `contentRatings` | `tmdb.metadata` | `['metadata']` | mediaContentRating |

The orchestrator inspects the plan, computes `Set<ApiCapability>`, fires each capability ONCE (so all four aspects that need `tmdb.metadata` share one fetch). Topo-sort by `dependsOn` ensures `structure` runs after `metadata`, `translations` runs after `structure`.

### Cadence engine

`packages/core/src/domain/media/use-cases/cadence/`:
- `cadence-knobs.ts` — `CadenceKnobs` interface + `DEFAULT_KNOBS` + `loadCadenceKnobs(db)` reading from settings registry.
- `compute-next-eligible.ts` — pure function: `(row, outcome, ctx, knobs, now) → Date`.
- `compute-plan.ts` — pure function: `(state, ctx, signal, languages, source, knobs, now) → { items: PlanItem[] }`.
- `effective-provider.ts` — `effectiveProvider(media, settings) → 'tmdb' | 'tvdb'`.
- `aspect-state-writer.ts` — `writeAspectState`, `buildForceAspects`, `buildMediaContext`, `classifyError`, `parseDateColumn`, `scopesFor`, `stateKey`.
- `__tests__/` — 25 unit tests covering all outcome × aspect × type combinations.

### Settings keys (in `packages/db/src/settings-registry.ts`)

```
cadence.emptyOutcomeCooldownDays    default 90
cadence.http4xxMaxAttempts          default 3
cadence.http5xxBaseBackoffMin       default 5
cadence.movieFreshWindowMonths      default 6
cadence.movieFreshFreqDays          default 30
cadence.movieAgedFreqDays           default 365
cadence.showFallbackFreqDays        default 7
```

Operators tune via the settings table; structure and rules stay in code.

### Localization service

`packages/core/src/domain/shared/localization/`:
- `types.ts` — `LocaleCode`, `LocalizedMedia`, `LocalizedSeason`, `LocalizedEpisode`, `LocalizationSource`, payload interfaces.
- `fallback-chain.ts` — `fallbackChain(requested) → readonly string[]`. Returns `['en-US']` if requested is `en-US`, otherwise `[requested, 'en-US']`.
- `localization-service.ts` — `resolveLocalizedMedia` / `resolveLocalizedMediaByExternal` / `resolveLocalizedMediaMany` / `resolveLocalizedSeasons` / `resolveLocalizedEpisodes` (reads), `upsertMediaLocalization` / `upsertSeasonLocalization` / `upsertEpisodeLocalization` (writes), `applyMediaLocalizationOverlay` / `applySeasonsLocalizationOverlay` / `applyMediaItemsLocalizationOverlay` (legacy-compatible overlay helpers).
- `index.ts` — barrel.

`packages/core/src/infra/media/media-localized-repository.ts` — the SQL underneath. Each `findMediaLocalized*` is one SELECT with one or two LEFT JOINs (user-lang + en-US) and per-field `COALESCE`. No JS-side merging.

### What got deleted

- `packages/core/src/domain/shared/services/translation-service.ts` (legacy `applyMediaTranslation`, `applySeasonsTranslation`, `translateMediaItems`, `translateEpisodeTitlesForItems`, `batchMediaTranslations`)
- `packages/core/src/domain/media/use-cases/run-media-pipeline.ts`
- `packages/core/src/domain/media/use-cases/replace-show-with-tvdb.ts`
- `packages/core/src/domain/content-enrichment/use-cases/refresh-all-language.ts` (was dead code — no callers)
- `packages/core/src/domain/media/use-cases/backfill-localization.ts`
- `apps/worker/src/jobs/backfill-localization.ts`
- `apps/worker/src/jobs/backfill-extras.ts`
- Schema definitions for `mediaTranslation`, `seasonTranslation`, `episodeTranslation` (and the corresponding tables via migration 0035)
- Queue declarations for `media-pipeline`, `reconcile-show`, `refresh-all-language`, `backfill-extras`
- Dispatcher shells: `dispatchRefreshExtras`, `dispatchReconcileShow`, `dispatchTranslateEpisodes`, `dispatchRefreshAllLanguage`
- `JobDispatcherPort` slimmed to `enrichMedia`, `rebuildUserRecs`, `traktSyncSection`

### What is intentionally kept

- `packages/core/src/domain/content-enrichment/use-cases/refresh-extras.ts` and `translate-episodes.ts` — the strategies delegate to these for their TMDB/TVDB plumbing. Could be inlined into the strategy files later but cohabit fine.
- The `refreshExtras` and `translateEpisodes` worker entries in `apps/worker/src/index.ts` — kept as drains for in-flight legacy jobs from older builds. Removable after a soak window in production confirms no jobs remain.
- Per-language i18n columns on the base `media` row (`title`, `overview`, `tagline`, `posterPath`, `logoPath`). See pending #1 for why.
- `media.metadata_updated_at` and `media.extras_updated_at` — duplicated by `media_aspect_state`, but harmless. See pending #5.
- `detect-gaps.ts` — Phase 3 left a comment that other callers (`ensure-media-many`, `persist/core`) might still use it. See pending #4 to verify.

---

## Pending work

Ordered by ROI.

### 1. Drop base media i18n columns (`title`, `overview`, `tagline`, `poster_path`, `logo_path`)

**Status:** deferred — biggest remaining item, separate refactor.

**Why it wasn't done in this session:** dropping these columns requires migrating every reader that does:
- `SELECT media.title`
- `WHERE media.title ILIKE ...`
- `ORDER BY media.title`
- `db.select({ title: media.title, ... })`

There are approximately 50 such call sites in infra repositories. Each must JOIN `media_localization` (with the standard user-lang + en-US LEFT JOINs and `COALESCE`) before it can read the title.

**Rough call site map (verify with grep before starting):**
- `packages/core/src/infra/user-media/library-feed-repository.ts` — search filter, sort columns, projection
- `packages/core/src/infra/user-media/profile-insights-repository.ts` — multiple projection sites
- `packages/core/src/infra/user-media/state-repository.ts`
- `packages/core/src/infra/user-media/stats-repository.ts`
- `packages/core/src/infra/user-media/playback-progress-repository.ts`
- `packages/core/src/infra/user-media/watch-history-repository.ts`
- `packages/core/src/infra/media/media-repository.ts` — search ILIKE + ORDER BY title
- `packages/core/src/infra/recommendations/recs-filter-builder.ts`
- `packages/core/src/infra/content-enrichment/extras-repository.ts`
- `packages/core/src/infra/lists/list-repository.ts`
- `packages/core/src/infra/media-servers/jellyfin.adapter.ts` (uses `media.title` for search query — needs en-US fallback)

**Implementation approach:**
1. Survey: `grep -rn "media\.title\|media\.overview\|media\.tagline\|media\.posterPath\|media\.logoPath" packages/core/src/infra apps/web` to enumerate every call site.
2. Each site: JOIN `media_localization` aliased `loc_user` (on `media_id` + user-lang) and `loc_en` (on `media_id` + `'en-US'`). Replace `media.title` with `COALESCE(loc_user.title, loc_en.title)`. Same for the other fields.
3. For sort: `ORDER BY COALESCE(loc_user.title, loc_en.title)` — note: sortable on the resolved title, not the raw column.
4. For search ILIKE: probably best to ILIKE the resolved title too, or maintain a denormalized `search_text` column on `media_localization` if perf becomes an issue.
5. Generate migration `ALTER TABLE media DROP COLUMN title, overview, tagline, poster_path, logo_path` (the writers don't populate them anymore; verify by grep first).
6. Apply, smoke-test every router that returns media to ensure UI doesn't break.

**Effort:** medium — mechanical but wide. Probably 3–4 hours of careful editing + verification. Worth a dedicated session and possibly a teammate.

**Risk:** medium. Sorting / filtering / search behavior must be preserved exactly. Type errors are useful guardrails (the `title: media.title` projections will fail to typecheck once the column is gone).

### 2. Stale BullMQ jobs in retired queues

**Status:** operational cleanup, do during prod deploy.

**Why:** Phase 3 deleted the `media-pipeline`, `reconcile-show`, `refresh-all-language`, and `backfill-extras` queue declarations. Any jobs that were sitting in `bull:<queue-name>:wait` at deploy time will linger in Redis with no consumer.

**Action:**
```bash
ssh user@192.168.0.204
docker exec -it canto-redis-1 redis-cli -a "$REDIS_PASSWORD"
> KEYS bull:media-pipeline:*
> DEL bull:media-pipeline:wait bull:media-pipeline:active bull:media-pipeline:completed bull:media-pipeline:failed bull:media-pipeline:delayed bull:media-pipeline:meta bull:media-pipeline:id bull:media-pipeline:events
> # repeat for reconcile-show, refresh-all-language, backfill-extras
> KEYS bull:reconcile-show:*
> DEL ...
> KEYS bull:refresh-all-language:*
> DEL ...
> KEYS bull:backfill-extras:*
> DEL ...
```

**Risk:** low. These jobs cannot be processed (no worker registered). Letting them sit harms nothing except Redis memory. Cleanup is hygiene.

### 3. Remove `refreshExtras` and `translateEpisodes` worker drains

**Status:** safe to remove after soak.

**Why kept:** Phase 3 retained the `refreshExtras` and `translateEpisodes` worker registrations in `apps/worker/src/index.ts` as drains for any in-flight jobs from older builds. After production runs for a day or two with zero jobs landing in those queues, they can be removed.

**Action (after soak):**
1. Confirm `LLEN bull:refresh-extras:wait` and `LLEN bull:translate-episodes:wait` are both 0 in prod and have been for several hours.
2. Edit `apps/worker/src/index.ts`:
   - Remove `import { refreshExtras } from "@canto/core/domain/content-enrichment/use-cases/refresh-extras";`
   - Remove `import { translateEpisodes } from "@canto/core/domain/content-enrichment/use-cases/translate-episodes";`
   - Remove the two `makeWorker(QUEUES.refreshExtras, ...)` and `makeWorker(QUEUES.translateEpisodes, ...)` blocks.
   - Remove `getTmdbProvider` / `getTvdbProvider` imports if they're no longer used.
3. Remove `refreshExtras` and `translateEpisodes` from `packages/core/src/platform/queue/queue-names.ts`.
4. Optionally delete `refresh-extras.ts` and `translate-episodes.ts` use-case files — BUT the strategies in `enrichment/strategies/extras.ts` and `enrichment/strategies/translations.ts` currently delegate to them. Either inline that logic into the strategies or keep the use-case files as helper modules (cleaner: keep them, just not as queue handlers).

**Effort:** ~15 minutes once soak confirms zero jobs.

### 4. Verify and possibly delete `detect-gaps.ts`

**Status:** check whether it's dead.

**Background:** Phase 3 left a comment that `ensure-media-many` and `persist/core` still call `detectGaps`. With the orchestrator now driven by `computePlan`, those callers may have been migrated and `detectGaps` may be dead.

**Action:**
```bash
grep -rn "detectGaps\|detect-gaps" packages/core/src apps --include="*.ts" | grep -v ".claude\|node_modules\|detect-gaps.ts:"
```

If the only remaining ref is `detect-gaps.ts` itself: delete it and its tests.

If there are real callers: leave it but flag for future cleanup.

**Effort:** 5 minutes of grepping + maybe a delete.

### 5. Deprecate `media.metadata_updated_at` and `media.extras_updated_at`

**Status:** deferred — `media_aspect_state` now covers both.

**Why kept for now:** dropping them would require:
- Removing the writes in `persistMedia` / `updateMediaFromNormalized` / `refreshExtras` / etc.
- Auditing every reader that uses the columns for staleness checks (e.g. `findMediaNeedingExtrasBackfill` was deleted, but other callers may exist).
- Migration to drop the columns.

**Implementation approach:**
1. `grep -rn "metadataUpdatedAt\|extrasUpdatedAt\|metadata_updated_at\|extras_updated_at" packages/core/src apps --include="*.ts"`.
2. Replace remaining staleness reads with reads from `media_aspect_state`.
3. Remove writes (the strategies' `applyToAspect` already writes to `aspect_state`; the legacy timestamp updates in `persist/core.ts` etc. are redundant).
4. Migration to drop the columns.

**Effort:** 1–2 hours.

**Risk:** low. The columns are not load-bearing for UX; they were always staleness markers consumed by retired logic.

### 6. Eager dispatch on `tvdb.defaultShows` toggle

**Status:** intentionally not done. We chose lazy migration.

**Current behavior:** when an admin flips `tvdb.defaultShows`, nothing happens immediately. The cadence sweep runs daily at 3am with jitter — it picks up shows where `materialized_source != effectiveProvider` (the planner detects mismatch) and migrates them lazily as their slots come up. Visit-triggered ensure-media also catches shows the user touches.

**When to add eager:**
- If operators flip the flag often (e.g., A/B testing TMDB vs TVDB structure)
- If users complain about delayed migration

**Implementation:** the tRPC procedure that updates the setting can dispatch `dispatchEnsureMedia(id, { aspects: ['structure'], force: true })` for every show in one fan-out. About 20 LOC.

### 7. Source precedence for manual edits in upsertLocalization

**Status:** deferred until manual editing UI exists.

**Current behavior:** `source` is overwritten on conflict in `upsertMediaLocalization` (and the sibling helpers). If a localization row has `source='manual'` (operator typed a custom title), the next TMDB refresh will overwrite it with `source='tmdb'`.

**When to fix:** when there's an admin UI that lets operators manually edit a localization row.

**Implementation:** in `upsertMediaLocalization`'s `ON CONFLICT DO UPDATE`, change `source` from a direct overwrite to:
```sql
source = CASE WHEN media_localization.source = 'manual' THEN 'manual' ELSE EXCLUDED.source END
```
And conditionally keep title/overview/etc. when existing source is `'manual'` — basically: never overwrite a `'manual'` row except when the new source is also `'manual'`.

**Effort:** ~30 minutes including tests.

### 8. Admin UI for cadence knobs

**Status:** keys are registered, UI is not.

**What's there:** `packages/db/src/settings-registry.ts` declares all 7 cadence keys with `inputType: "number"` so they're settable via SQL or whatever generic settings UI exists.

**What's missing:** if the web app has a dedicated settings page that renders specific groups, the `cadence` group needs to be added.

**Effort:** depends on the existing settings UI. Probably 30 minutes if there's a pattern to follow.

### 9. Operational checklist (production deploy)

- [ ] `git pull` on VM 102.
- [ ] `docker compose -f docker-compose.prod.yaml up -d --build`.
- [ ] Watch worker logs: `docker logs -f canto-worker-1` for 5 minutes. Look for `Workers started`, `[backfill-aspect-state] processed N medias, inserted M rows`. The first run may insert a chunk of rows; subsequent runs should report 0.
- [ ] Verify queues: `redis-cli LLEN bull:ensure-media:wait`, `LLEN bull:ensure-media:active`. The active count should be 1–3 (concurrency = 3); waiting drains over time.
- [ ] Clean up retired queues (pending #2).
- [ ] Watch CPU: `docker stats canto-worker-1`. Should sit well under 50% idle, peaking during fetch waves.
- [ ] After 24h: confirm no new entries in `bull:refresh-extras:wait` or `bull:translate-episodes:wait` (so #3 can proceed).
- [ ] After 48h soak with no errors: pending #1 (drop base media i18n columns) becomes the next major item.

---

## Glossary

- **Aspect** — one of `metadata | structure | extras | translations | logos | contentRatings`. The unit at which the orchestrator tracks progress.
- **Scope** — sub-key of an aspect. Empty string for non-language-scoped aspects (`metadata`, `extras`, `structure`, `contentRatings`); locale code (`pt-BR`, `de-DE`) for language-scoped aspects (`translations`, `logos`).
- **`materialized_source`** — for `aspect='structure'` only: which provider populated the seasons/episodes (`tmdb` or `tvdb`). When this differs from the current `effectiveProvider(media, settings)`, the planner forces a structure re-fetch + drop+reseed.
- **`effectiveProvider`** — function that resolves: per-media `overrideProviderFor` wins, else if media is a show and `tvdb.defaultShows` is true → `'tvdb'`, else the media's own `provider` column.
- **Outcome** — result of a strategy's `applyToAspect`: `data | empty | partial | error_4xx | error_5xx`. Drives `next_eligible_at` via `computeNextEligible`.
- **Signal** — input to `computePlan` describing what triggered the run: `discovered | visited | periodic | forced`.

---

## Files of interest (for cold pickup)

If you're picking this up cold and want to understand the flow end-to-end, read in this order:

1. `packages/db/src/schema.ts` — search for `mediaAspectState`, `mediaLocalization`, `seasonLocalization`, `episodeLocalization`.
2. `packages/core/src/domain/media/use-cases/cadence/index.ts` — barrel; from there the four cadence files.
3. `packages/core/src/domain/media/enrichment/types.ts` — strategy interface.
4. `packages/core/src/domain/media/enrichment/registry.ts` — exhaustive aspect → strategy map.
5. `packages/core/src/domain/media/enrichment/strategies/metadata.ts` (then the others).
6. `packages/core/src/domain/media/use-cases/ensure-media.ts` — the orchestrator (~186 LOC).
7. `packages/core/src/domain/shared/localization/localization-service.ts` — read + write helpers, single-query patterns.
8. `packages/core/src/infra/media/media-localized-repository.ts` — the SQL underneath.
9. `packages/core/src/infra/media/media-aspect-state-repository.ts` — state CRUD.
10. `apps/worker/src/index.ts` — worker boot + schedule + queue + handler wiring.

Read `.claude/skills/handbook/core.md` and `worker.md` first if you need the architectural rules.
