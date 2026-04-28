# Download flow — TRaSH alignment status

Snapshot of what's shipped, what's parked, and where in the codebase
each piece lives. Refreshed after the handbook conformance pass
(god-file decomposition, worker handler extraction, db schema
hardening).

Scoring lives in:
- `packages/core/src/domain/shared/rules/scoring.ts` — `calculateConfidence` / `explainConfidence` engine
- `packages/core/src/domain/shared/rules/scoring-rules.ts` — `ScoringRules` + `AdminDownloadPolicy` + `DownloadPreferences` shapes, overlay helpers, and `composeDownloadRules` (admin policy + user prefs)
- `packages/core/src/domain/shared/rules/media-flavor.ts` — flavor heuristic
- `packages/core/src/domain/torrents/rules/parsing-release.ts` — detection helpers
- `packages/core/src/domain/torrents/rules/parsing-episodes.ts` — `parseSeasons`/`parseEpisodes` + `matchesSearchIntent` (rejects releases whose S/E tokens contradict the user's pick)
- `packages/core/src/domain/torrents/rules/release-attributes.ts` — parser composer
- `packages/core/src/domain/torrents/rules/release-groups.ts` — classification (lookup tables hydrated from DB)
- `packages/core/src/domain/torrents/rules/download-profile.ts` — profile model + cutoff helpers
- `packages/core/src/domain/torrents/use-cases/search-torrents.ts` — orchestration (`prepareSearch` runs lookups/media/blocklist in parallel; derives a show-shaped `intent` so `scoreRawResults` can drop wrong-bucket releases)
- `packages/core/src/domain/torrents/use-cases/auto-supersede.ts` — strict gate around `replaceTorrent`, reads `download.releaseGroup` snapshot
- `packages/core/src/domain/torrents/use-cases/run-repack-supersede.ts` — repack scan orchestrator (called from the worker)
- `packages/core/src/infra/torrents/download-config-repository.ts` — reads `download_config` + `download_release_group`
- `packages/core/src/infra/torrents/download-profile-repository.ts` — reads `download_profile`
- `packages/core/src/infra/torrents/download-repository.ts` — bare-fn helpers including `findRecentImportedDownloads`
- `packages/db/src/seed-download-defaults.ts` — canonical default rules + tier lists, idempotent boot seed

UI lives in:
- `apps/web/src/components/media/download/` — download modal shell + extracted siblings (`torrent-results.tsx` orchestrator with infinite-scroll sentinel, `use-torrent-search-stream.ts` fan-out hook with `pageCount`/`loadMore`, `torrent-card.tsx` memo'd, `filter-toolbar*` mobile/desktop variants, `scanning-state.tsx`, `confidence-chip.tsx`)
- `apps/web/src/app/(app)/manage/_components/download-profiles-section.tsx` — profile list shell + extracted siblings (`download-profile-editor.tsx`, `download-profile-flavor-group.tsx` memo'd, `download-profile-row.tsx`, `download-profile-formats-field.tsx`, `download-profile-defaults.ts`)
- `apps/web/src/app/(app)/manage/_components/download-preferences-section.tsx` — Personal preferences (per-user) + Server policy (admin-only)
- `apps/web/src/components/settings/download-folders.tsx` — per-folder profile selector + folder routing rules editor (decomposed into `_folders/`)

Worker:
- `apps/worker/src/jobs/repack-supersede.ts` — thin handler delegating to `runRepackSupersede`, logs via the injected `JobLogger`. Scheduled every 6h with a 14-day lookback and 50-download cap.
- `apps/worker/src/index.ts` calls `seedDownloadDefaults(db)` alongside `seedLanguages` at boot

Tests:
- `packages/core/src/domain/shared/rules/__tests__/scoring.test.ts` — frozen real-world corpus snapshot
- `packages/core/src/domain/torrents/rules/__tests__/parsing-episodes.test.ts` — `matchesSearchIntent` cohort (full show / specific season / specific episodes) with multi-episode and full-series pack edge cases

---

## Shipped

### Scoring engine — TRaSH-aligned signals
- [x] Health by seeder count (log-scale, dead-torrent guard)
- [x] Quality (UHD / FullHD / HD / SD)
- [x] Source (Remux > BluRay > WEB-DL > WEBRip > HDTV; Telesync / CAM penalised)
- [x] Codec context-aware (HEVC only rewarded at UHD; H.264 preferred at HD/FullHD; AV1 rewarded everywhere)
- [x] HDR (DV-HDR10 > DV > HDR10+ > HDR10 ≈ HDR > HLG)
- [x] UHD-without-HDR penalty (−10) so 4K SDR doesn't beat 1080p HDR
- [x] Audio codec (TrueHD Atmos > DTS-HD MA > TrueHD > … > AAC)
- [x] Audio channels (7.1 > 5.1 > 2.0)
- [x] Multi/Dual audio token + multi-language detection
- [x] Streaming service tags (NF, AMZN, ATVP, DSNP, HMAX, HULU, PCOK, STAN, PMTP, CR)
- [x] Combo jackpot (UHD Remux + DV/DV-HDR10 + Atmos)
- [x] Freshness (≤1d / ≤7d / ≤30d / ≤90d / ≤365d)
- [x] Release-group tier (T1 / T2 / T3 / neutral / avoid)
- [x] Anime-aware tier dispatch (movie / show / anime lists)
- [x] Repack/Proper/Rerip with count-aware scaling
- [x] Hybrid release bonus
- [x] Indexer flags — exclusive freeleech tiers + additive doubleupload/nuked
- [x] CAM keyword scan with `hasDigitalRelease` context

### Architecture
- [x] Config-driven `ScoringRules` — every weight, threshold, and bonus is data
- [x] Pure parser (`parseReleaseAttributes`) compositing all detectors
- [x] Pure engine (`calculateConfidence` / `explainConfidence`) consuming attrs + ctx + rules
- [x] Layered overlays: DB defaults → admin policy → user prefs → quality profile → engine
- [x] Scoring rules + release-group tier list hydrated from DB at search time, no hardcoded fallback
- [x] Idempotent boot seed (`seedDownloadDefaults`) writing canonical TRaSH defaults

### DB-driven config
- [x] `download_config` (single-row admin table): scoringRules JSONB, preferredEditions, avoidedEditions, av1Stance
- [x] `download_release_group` (per-flavor tier rows, PK `(name_lower, flavor)`)
- [x] tRPC `downloadConfig.{getPolicy, setPolicy}` (admin-only)
- [x] `download_release_group` rows can be added/edited per instance — no fork needed for custom group overrides

### Per-user preferences (overlay onto rules)
- [x] Preferred languages (boost matching releases)
- [x] Preferred streaming services (boost tagged releases)
- [x] Settings UI under `/manage` → Storage → Download Preferences (Personal preferences section)

### Admin download policy (server-wide, applies to every search)
- [x] Preferred / avoided editions (lives on `download_config`)
- [x] AV1 codec stance (lives on `download_config`)
- [x] Settings UI under `/manage` → Storage → Download Preferences (Server policy section, admin-only)

### Download Profile + Cutoff
- [x] Schema: `download_profile` (allowedFormats / cutoff / minTotalScore / flavor / isDefault) + `download_folder.download_profile_id` FK
- [x] Profile applied as engine overlay; combos outside `allowedFormats` are rejected
- [x] Resolution chain: `media.downloadProfileId` → `folder.downloadProfileId` → system default per flavor → none
- [x] `aboveCutoff` flag exposed on every search result + UI badge
- [x] `compareToProfile` helper for upgrade decisions
- [x] tRPC `downloadProfile.{list, get, create, update, delete, setDefault, seed}`
- [x] Editor UI in `/manage` → Storage → Download Profiles
- [x] Per-folder profile selector in the Libraries editor
- [x] Default profiles seedable in one click (one per flavor, marked default)

### Search query construction
- [x] ID-based (tmdbId/imdbId/tvdbId) + season/episode tokens
- [x] Full-show fan-out: title + `${title} Complete` (catches season packs indexed under "Complete")
- [x] Custom query: text-only, ID params skipped

### Per-indexer streaming UI
- [x] Indexers expose `id` + `name` for chip rendering
- [x] Backend split: `searchTorrents` (batch), `searchOnIndexer` (single), shared `prepareSearch` + `runOneIndexer` + `scoreRawResults` helpers
- [x] tRPC `torrent.listIndexers` + `torrent.searchOnIndexer`
- [x] Client `useTorrentSearchStream` hook fans out `(indexer × pageCount)` via `useQueries`
- [x] Scanning state shows per-indexer chips (pending / success+count+ms / error)
- [x] Results render as soon as the first indexer responds; slow indexers never block fast ones
- [x] Cross-indexer dedup uses the magnet info-hash, not the title — same release on two trackers collapses without flicker
- [x] Infinite scroll: IntersectionObserver sentinel triggers `loadMore` when the bottom of the list approaches; prior Prev/Next pagination removed (was vestigial after streaming landed — `page` was hardcoded to 0)
- [x] Footer shows `X results · N trackers` (distinct sub-tracker count from result rows) — local indexer count was always `1/1` since Prowlarr is the only one and meant nothing

### Search intent filter
- [x] `matchesSearchIntent` rejects releases whose season/episode tokens contradict the user's pick (Full show / specific season / specific episodes). Mirrors Sonarr's "wrong-bucket" rule. Skipped for movies and custom queries. 17 unit tests in `parsing-episodes.test.ts`.

### Download modal header
- [x] Single-row `flex h-14 items-center` header (was a 2-row title+description block whose vertical centering drifted against the icon buttons)
- [x] Title leads with media name; falls back to plain `Download` when `mediaTitle` is empty so the dash never dangles. `DialogDescription` moved to `sr-only` for a11y.

### Phase 6a — Repack auto-supersede
- [x] `download.repackCount` persisted at download time
- [x] `download.releaseGroup` snapshotted at download time (migration `0029_thankful_mysterio.sql`); `autoSupersedeWithRepack` reads the column directly with a parser fallback for pre-migration rows
- [x] `autoSupersedeWithRepack` gate: same group + same quality/source + strictly higher repackCount, with profile check that allows equivalent verdicts and blocks downgrades / out-of-profile combos
- [x] BullMQ scheduled job (`repackSupersede`, every 6h, 14-day lookback, 50 downloads per run, log line aggregating skip reasons)
- [x] Worker handler delegates to `runRepackSupersede` core use-case; logs via injected `JobLogger`, no inline DB queries
- [x] Wired into worker boot

### Score explainability
- [x] `explainConfidence` returns per-rule contributions (label, points, optional detail) alongside the final score
- [x] `breakdown` field on `SearchResult` carries the components through the tRPC layer
- [x] Confidence chip in the download modal hovers a popover showing each contribution and the raw / max ratio

### Test coverage
- [x] Real-world corpus snapshot (~23 titles across movies, shows, anime, plus penalty edges) frozen via `toMatchInlineSnapshot`
- [x] Cohort assertions for design intent (FLUX jackpot beats NTb HDR10, avoid groups always lose to T1, nuked drives score to 0, …)

### Naming consolidation
- [x] `qualityProfile` → `downloadProfile` everywhere (table, FK columns, repo, tRPC, UI). Migration `0026_mighty_killmonger.sql`.
- [x] `torrent` → `download` (table, mediaFile FK, repository functions, types). qBit-side adapter and `searchTorrents` deliberately keep their original names. Migration `0027_superb_the_hunter.sql`.

### Handbook conformance pass
- [x] Worker `handleRepackSupersede` extracted to core `runRepackSupersede` (109 LoC handler → ~45 LoC wiring + JobLogger; new `findRecentImportedDownloads` repository helper)
- [x] `composeRules` helper at the top of `torrent/search.ts` moved to core as `composeDownloadRules` in `scoring-rules.ts` (router stays pure orchestration)
- [x] `prepareSearch` runs `findReleaseGroupLookups`, `findMediaById`, `findBlocklistByMediaId` in parallel (Promise.all) — collapses three round-trips into one
- [x] `download_config` singleton constraint: sentinel column + unique index + `CHECK (singleton = true)` so a stray second config row is impossible. Migration `0028_round_eternals.sql`.
- [x] `useEffect` reset on the download modal replaced with `onOpenChange` handler (eslint-disable removed)
- [x] `apps/web/src/components/media/download/torrent-results.tsx` decomposed (881 → 193 LoC orchestrator) into `torrent-card.tsx` (memo'd), `filter-toolbar.tsx` + mobile/desktop variants, `scanning-state.tsx`, `confidence-chip.tsx`
- [x] Empty/error states under `StateMessage` + `SPACE_STATES` (`emptySearch`, `errorSearch`)
- [x] `apps/web/src/app/(app)/manage/_components/download-profiles-section.tsx` decomposed (740 → 185 LoC) into `download-profile-editor.tsx` (key-based reset replacing the `useEffect` state sync), `download-profile-flavor-group.tsx` (memo'd), `download-profile-row.tsx`, `download-profile-formats-field.tsx`, `download-profile-defaults.ts`
- [x] `apps/web/src/components/settings/download-folders.tsx` decomposed (2,571 → 198 LoC) with 14 siblings under `_folders/` (DSL helpers in `folder-routing-rules-ui.ts`, condition editor, rule card, rules editor, qbit-import dialog, scan dialog, etc.). Public `DownloadFolders` API preserved.

---

## Parked / not shipped

### Phase 6a — Notification UX
**What's missing:** "We just superseded X with REPACK" notifications.
The job logs to stdout but doesn't push anything user-visible.

**Why parked:** Notification subsystem hasn't been built yet. The
requirement is captured in `notification.md` so it gets folded in
when the system lands.

### Anime-specific scoring tweaks
**What:** Source preference flattening (BluRay isn't strictly > WEB-DL
for anime), bigger `dual` audio bonus, smaller freshness factor when
flavor is anime.

**Why parked:** The anime tier list already differentiates anime
release-group preferences. The remaining tweaks are second-order and
need real-world signal to tune sensibly.

**Effort:** S each. Add when anime users report bad rankings.

### Strict language filter on profiles
**What:** Today profile language preference is a *boost*. Some users
want a *filter* — "Anime BD profile only accepts Japanese audio".

**Why parked:** Roadmap intentionally avoided strict-mode in v1 to
avoid over-filtering. Add as an opt-in flag per profile when demand
emerges.

**Effort:** S.

### TRaSH guides JSON import
**What:** Sonarr/Radarr users can import TRaSH's published JSON
custom-format definitions directly. Replicating that would let our
defaults track upstream automatically.

**Why parked:** Format-translation work; TRaSH's JSON references
Sonarr-specific concepts (custom formats, indexer flags) that don't
1:1 map to our model.

**Effort:** L.

### Observability / scoring metrics
**What:** Score distribution histograms, profile-rejection rate per
flavor, indexer success/latency, supersede outcome counts.

**Why parked:** Out of scope for the alignment work. Picked up when a
metrics sink (Prometheus / OTel collector / log aggregation) is wired
into the platform.

**Effort:** M.

---

## Scoring decisions worth remembering

- **MAX_RAW = 170**, calibrated from the achievable positive ceiling
  with all signals aligned. If a future addition breaks this, recompute
  before shipping. The corpus snapshot will surface the drift.
- **Profile weights cap at 100** in the validator — keeps profile-driven
  scoring in the same magnitude as the TRaSH bonuses (each capped near
  10–13) so neither axis drowns the other.
- **Avoid groups penalty = −40**. Strong enough that an LQ release with
  every other bonus aligned still scores below a neutral release. Don't
  weaken it without a reason.
- **Profile is filter + rank, not blend.** Combos outside `allowedFormats`
  return 0 (rejected). Combos inside earn `entry.weight + bonusSum`. No
  multiplicative blending. Mirrors Sonarr's quality + custom-format model.
- **Anime detection is heuristic, not a column.** `originCountry` includes
  "JP" or `originalLanguage === "ja"` AND animation-genre signal. False
  negatives are cheap; false positives corrupt scoring.
- **Admin policy applies before per-user prefs.** A user preferring an
  edition the admin avoided still gets the avoid penalty — admin layer
  is policy, not taste.
- **Repack supersede is intra-slot.** Same group + same (quality,
  source) + strictly higher repackCount. The profile check allows the
  "equivalent" verdict because a same-slot REPACK by definition
  doesn't change the profile match.
