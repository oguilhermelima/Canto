# Torrent Confidence Scoring — Roadmap to TRaSH Parity

Companion to `DOWNLOAD_BACKLOG.md`. The backlog enumerates the gaps; this
document sequences them into shippable phases with concrete file paths,
schema changes, and decision points.

> **Status (2026-04-27): Phases 1–5 complete. Phase 6b (streaming UI)
> shipped — slow indexers no longer block fast ones. Phase 6a's
> auto-supersede scheduler is the only meaningful gap remaining;
> repack data is already plumbed. See `DOWNLOAD_BACKLOG.md` for the
> line-by-line snapshot.**

## Phase status

| Phase | Status | Commits |
|-------|--------|---------|
| 1. Pure scoring polish | ✅ shipped | `20e90ef5`, `da873117`, `8e694e43`, `24204e2c` |
| Engine refactor (config-driven) | ✅ shipped | `e0859d99` |
| 2. Per-user prefs plumbing | ✅ shipped | `42e56687` |
| 3. Tiered groups + anime flavor | ✅ shipped | `97c06a58` |
| 4. Settings UI (download prefs) | ✅ shipped | `e5f5c58d`, `7ea5ec7b`, `78cf8daf` |
| 5. Quality Profile + Cutoff | ✅ shipped | `f5aaa9e7`, `f0d64ca2`, `85c4defa`, `46a23bac`, `70a24e75` |
| 6b. Per-indexer streaming UI | ✅ shipped | `f2f347e6`, `b030569a` |
| 6c. "Complete" fan-out | ✅ shipped | `5b3eef9b` |
| 6d. AV1 stance | ✅ shipped | `62eaa150` |
| 6a. Repack auto-supersede (data) | 🟡 partial — column populated; scheduler+notifications deferred | `9c98d1b8` |

## TL;DR

Six phases, ordered from "ship today" to "ambitious feature work".

- **Phase 1** — pure scoring polish. Eight self-contained tweaks to
  `scoring.ts`/`parsing-release.ts`, no schema, no UI, splittable into
  individual commits.
- **Phase 2** — preference plumbing (per-user via the existing
  `userPreference` table) and wiring of the existing-but-unused detectors
  (audio channels, edition, languages, streaming services).
- **Phase 3** — promote `release-groups.ts` from binary to numeric tiers,
  introduce an anime-aware scoring track via a `mediaFlavor` heuristic
  (no schema migration).
- **Phase 4** — settings UI inside the existing `preferences` area, so all
  prefs from Phase 2 finally have controls.
- **Phase 5** — Quality Profile system on top of the existing-but-skeletal
  `qualityProfile` table; wires it into `searchTorrents` (filter + cutoff)
  and surfaces it on each library/folder.
- **Phase 6** — operational polish: repack auto-supersede, per-indexer
  streaming UI, "Complete" fan-out, AV1 stance.

Phases 1, 2, 3 can land in a single sprint. Phase 5 is the headline TRaSH
feature and deserves its own design pass before code.

---

## Cross-cutting principles

- **Detection stays pure.** Every `detectX(title)` is a pure function.
  Scoring stays a pure function over
  `(title, quality, flags, seeders, age, ctx)`. The only thing that changes
  per phase is what's in `ctx` and how rich the score's components are.
  Keeps tests cheap and prevents detection logic from leaking into the
  orchestration layer.
- **Reuse what exists, don't duplicate.** `qualityProfile`,
  `userPreference`, `downloadFolder.rules`, `media.qualityProfileId` are
  already in the schema and unused by the search flow. Any phase that needs
  configurability plugs into these tables before adding new ones.
- **Keep the tRPC contract additive.** `torrent.search` already exposes
  `confidence`, `quality`, `source`, `releaseGroup`, `codec`. Treat that as
  the public contract for mobile + web. New scoring inputs/outputs go on
  `ConfidenceContext` and the response payload — nothing breaking.
- **Mobile parity guardrail.** Expo consumes the same `torrent.search`
  query. Anything that changes the request/response shape needs a check in
  `apps/mobile/`. Each phase below lists the mobile impact.

---

## Phase 1 — Pure scoring polish

> No schema, no UI. Each bullet ≈ one commit.

**Goal.** Close items 1, 2, 3, 4, 6, 8 from `DOWNLOAD_BACKLOG.md` plus a
streaming-services detector. After this phase, *4K SDR x265-FLUX* stops
beating *1080p HDR DV TrueHD-Atmos NTb*, and TRaSH-aligned subtleties like
DV+HDR10 fallback get rewarded.

### Files

- `packages/core/src/domain/torrents/rules/parsing-release.ts` — extend
  `detectHdrFormat` to return `"DV-HDR10"` separately from pure `"DV"`;
  add `detectStreamingService(title)` returning
  `"NF" | "AMZN" | "ATVP" | "DSNP" | "HMAX" | "HULU" | "PCOK" | "STAN" | "PMTP" | null`.
  Tighten `MULTi`/`DUAL` token detection by reading what `detectLanguages`
  already produces.
- `packages/core/src/domain/torrents/rules/parsing.ts` — re-export the new
  helper.
- `packages/core/src/domain/shared/rules/scoring.ts` — wire all eight
  tweaks below.
- `packages/core/src/domain/torrents/use-cases/search-torrents.ts` —
  surface `streamingService` and `audioChannels` on the result row so the
  UI can chip them later.
- `packages/core/src/domain/torrents/types/common.ts` — no new fields on
  `ConfidenceContext` for Phase 1 (`hasDigitalRelease` already there).
- *(Tests)* sibling `*.test.ts` files for `parsing-release.ts` and
  `scoring.ts`.

### Individual scoring deltas

1. **UHD-without-HDR penalty.** After the HDR block in `scoring.ts`:
   `if (quality === "uhd" && !hdr) score -= 10;` Closes backlog #1.
2. **DV+HDR10 fallback split.** Add `"DV-HDR10"` to the HDR map (regex
   `/\b(dv[.\s-]?hdr10|dovi[.\s-]?hdr10|dolby[.\s-]?vision[.\s-]?hdr10)\b/`,
   ordered before pure DV). Score: `DV-HDR10 = +13`, `DV = +12`,
   `HDR10+ = +10`, `HDR10 = +8`. Closes backlog #6.
3. **Audio channels bonus.** Wire `detectAudioChannels`: `7.1 = +3`,
   `5.1 = +2`, `2.0 = 0`. Closes backlog #3.
4. **Multi/Dual audio bonus.** Read `detectLanguages(title)`. If `"multi"`
   or `"dual"` token present, `+2`. If 2+ non-meta language codes
   (excluding `"multi"`, `"dual"`, `"multi-subs"`), `+1` (capped — no
   double counting). Closes backlog #4.
5. **Streaming services bonus (static).** Tiny `+1` for any major service
   tag (NF/AMZN/ATVP/DSNP/HMAX/HULU/PCOK/STAN). A tagged WEB-DL beats an
   untagged one. Phase 2 makes it user-configurable. Closes the static
   half of backlog #2.
6. **Combo bonus — UHD Remux DV Atmos.** After additive bonuses:
   `if (quality === "uhd" && source === "remux" && (hdr === "DV" || hdr === "DV-HDR10") && audio?.includes("Atmos")) score += 5;`
   Closes backlog #8.
7. **Surface scored fields.** Add `streamingService`, `audioChannels`,
   `edition` to `SearchResult` for chip display. UI renders them but
   doesn't filter on them yet — that lands with Phase 4.
8. **Recalibrate `MAX_RAW`.** New bonuses push the achievable ceiling up;
   re-derive (current 160 → ~175). Avoids artificial compression of the
   0–100 range.

### Data model / API impact

- **Schema:** none.
- **API:** additive — three new optional string fields on `SearchResult`.
  Backward-compatible.
- **Mobile:** no changes required.

### Effort & risks

- **Effort:** S (each bullet 5–20 lines).
- **Risks:**
  - Streaming-service tag disambiguation (`"NF"` could appear inside
    other words). Use word boundaries; test against the existing torrent
    corpus.
  - Bonus inflation. Re-tune `MAX_RAW` before merging or score
    distribution skews high.
  - DV-HDR10 detection has ~5–10% miscategorisation due to inconsistent
    indexer titles. Acceptable cost.

---

## Phase 2 — Preference plumbing (server-side only)

> Scoring **reads** user preferences. UI lands in Phase 4.

**Goal.** Unblock per-user streaming bias, per-user language boost, and
per-user edition preference (backlog #9, #13, dynamic half of #2). Gives
Phase 4 a server-ready target so the UI is the only thing missing.

### Files

- `packages/core/src/domain/torrents/types/common.ts` — extend
  `ConfidenceContext` with optional fields:
  - `preferredLanguages?: string[]` (ISO codes)
  - `preferredStreamingServices?: string[]` (e.g. `["NF","ATVP"]`)
  - `preferredEditions?: string[]` (e.g. `["IMAX","Extended"]`)
  - `avoidedEditions?: string[]` (e.g. `["Theatrical"]`)
- `packages/core/src/domain/shared/rules/scoring.ts` — apply preference
  bonuses if present in ctx (`+4` for matching preferred language, `+3`
  for streaming service, `+2`/`-3` for edition match/avoid).
- `packages/core/src/domain/torrents/use-cases/search-torrents.ts` — load
  prefs once per call via `findUserPreferences(db, userId)` (already
  exists at
  `packages/core/src/infra/file-organization/library-repository.ts`).
  Add `userId` to `SearchInput`.
- `packages/api/src/routers/torrent/search.ts` — pass
  `ctx.session.user.id` into `searchTorrents`.
- `packages/core/src/infra/file-organization/library-repository.ts` —
  extend the typed-key helper with new keys:
  `download.preferredLanguages`, `download.preferredStreamingServices`,
  `download.preferredEditions`, `download.avoidedEditions`.

### Decision: per-user vs per-folder for prefs

Per-user is the right default for languages and streaming services — a
user's tolerance for Hulu's bitrate doesn't change between movie and
anime libraries. Edition prefs *could* plausibly vary per folder
("Movies" likes Extended, "Kids Movies" wants Theatrical), but it's a
niche optimization.

**Recommendation: ship Phase 2 as per-user only.** If demand emerges,
Phase 5's per-folder quality profiles are the natural place to layer
per-folder overrides — folder routing already binds folders to media.
Don't pre-build a per-folder pref system that has no consumer.

### Data model / API impact

- **Schema:** none — `userPreference` is already a flexible JSONB store.
- **API:** none on `torrent.search` request shape (userId is
  server-derived). Response unchanged.
- **Mobile:** keeps working.

### Effort & risks

- **Effort:** S.
- **Risks:**
  - Per-user prefs in scoring means search results are no longer
    pure-cacheable across users. They never were truly cacheable
    (different folder routing per user), so this is theoretical.
  - Edition avoid (`-3`) is asymmetric; preferring Extended doesn't
    automatically avoid Theatrical. Keep the two lists distinct.

### Dependencies

Phase 1 (so the `streamingService`/`audioChannels`/`edition` fields
exist on the result).

---

## Phase 3 — Sub-tiered release groups + anime track

**Goal.** Close backlog #5 and #11. Today the group tier is gold/avoid
binary; TRaSH publishes 3-tier gold lists (T1 > T2 > T3), separate
movie/show lists, and a separate anime list.

### Files

- `packages/core/src/domain/torrents/rules/release-groups.ts` — replace
  `ReleaseGroupTier = "gold" | "avoid" | "neutral"` with a richer shape:
  ```ts
  type ReleaseGroupTier = "tier1" | "tier2" | "tier3" | "neutral" | "avoid";
  type ReleaseFlavor = "movie" | "show" | "anime";
  classifyReleaseGroup(group, flavor) → { tier, weight }
  ```
  Curate three lists per flavor (movie/show/anime), each with T1/T2/T3
  and avoid.
  - **Anime T1**: Vodes, Kulot, MTBB, LostYears, Koi (already in our
    gold list — promote them; demote in movie/show context).
  - **Movies T1**: FLUX, NTb, BMF, DON, EbP, CtrlHD.
  - **Shows T1**: NTb, FLUX, CMRG, RAWR.
- `packages/core/src/domain/shared/rules/scoring.ts` — bonuses become
  `T1 = +12, T2 = +8, T3 = +5, neutral = 0, avoid = -20`. Pull `flavor`
  from `ConfidenceContext`.
- `packages/core/src/domain/torrents/types/common.ts` — add
  `flavor?: "movie" | "show" | "anime"` to `ConfidenceContext`.
- `packages/core/src/domain/shared/rules/media-flavor.ts` *(new)* — pure
  helper:
  ```ts
  resolveMediaFlavor(media): "movie" | "show" | "anime"
  ```
  Heuristic: `type === "show" && (originCountry includes "JP" || genres
  includes "Animation" || genreIds includes 16)` → `"anime"`. Mirrors
  the heuristic in `migrate-folders.ts` so behaviour stays consistent.
- `packages/core/src/domain/torrents/use-cases/search-torrents.ts` —
  call `resolveMediaFlavor(row)` and put it in `confidenceCtx`.

### Anime data model decision

Three options considered:

1. Add `media.type = "anime"` as a third discriminator. **Rejected** —
   breaks `CLAUDE.md`'s "single Media entity, no separate movie/show
   tables" principle, ripples into 60+ files that switch on `type`,
   conflicts with TMDB's lack of an anime category.
2. Add `media.isAnime: boolean` column. **Rejected for now** — incurs a
   migration and a populate job for a signal already derivable from
   existing columns.
3. **Heuristic at scoring time, lift to a column only if perf demands
   it.** **Recommended.** Keep `type === "show"`, compute flavor on
   the fly. Heuristic runs once per search call against the
   already-loaded media row. Promote to a generated column or cached
   field only if measurement says so.

### Optional anime-specific scoring

When `flavor === "anime"`:
- Source preference flattens (BluRay isn't strictly > WEB-DL).
- `dual` audio bonus increases (+4 instead of +2).
- Freshness becomes a smaller factor.

Defer to Phase 4 if needed — basic flavor-aware tier list is enough for
Phase 3.

### Data model / API impact

- **Schema:** none.
- **API:** `SearchResult` could optionally surface `flavor` and a
  numeric `groupTier`. Both additive.
- **Mobile:** no changes required.

### Effort & risks

- **Effort:** M (curated lists are the bulk of the work).
- **Risks:**
  - Tier curation is opinionated and ages fast. TRaSH updates lists
    monthly. **Mitigation:** structure the file so the list is a JSON
    literal at the top, separate from logic — easy to refresh from
    TRaSH guides without touching code.
  - Heuristic anime detection misses anime that TMDB classifies as
    `"Drama"` or with non-JP origin. Accept the false-negative rate;
    promote to `media.flavor` column only after measuring.
  - Three lists × three tiers means false-positive risk grows. Keep
    `avoid` aggressive, gold tiers conservative.

### Dependencies

Phase 1 (so the `releaseGroup` field is already on the result).

---

## Phase 4 — Settings UI for download preferences

**Goal.** Surface every Phase 2/3 preference as a real control.

### Files

- `apps/web/src/app/(app)/preferences/_components/downloads-section.tsx`
  *(new)* — section in the existing preferences page:
  - Preferred languages multi-select (driven by `supportedLanguage`
    table + `detectLanguages` codes).
  - Preferred streaming services chips (eight from Phase 1).
  - Edition preference: "Prefer" (multi-select) and "Avoid"
    (multi-select) with the canonical list from `EDITION_MAP`.
  - "Anime conventions" toggle — opt-in for users who want the anime
    scoring track applied to all `type=show` items, not just heuristic
    matches. Defaults off (heuristic only).
- `apps/web/src/app/(app)/preferences/_components/preferences-nav.tsx` —
  add the new section to nav.
- New tRPC tree `preferences.downloads.{get,set}` (new
  `packages/api/src/routers/preferences/` or extend
  `userMedia/state.ts`).
- `packages/validators/src/preferences.ts` *(new)* — Zod schemas.
- *(Mobile)* same section once web ships, but not blocking.

### Per-user vs per-folder revisited

The existing `downloadFolder.rules` JSONB carries routing rules. Could
it carry scoring prefs too? **Yes, but don't.** Conflating "what media
this folder accepts" with "how I score torrents for that media" is the
kind of dual-purpose JSONB that resists evolution. If folder-scoped
scoring becomes necessary, add `downloadFolder.scoringPrefs jsonb` as a
separate column — but ship Phase 4 as user-scoped first.

### Data model / API impact

- **Schema:** none (uses `userPreference`).
- **API:** new procedures `preferences.downloads.{get,set}`.
- **Mobile:** consumes the same procedures eventually.

### Effort & risks

- **Effort:** M (UI-heavy: ~3 form components, validation, mutation
  hooks).
- **Risks:**
  - Empty defaults must equal Phase 2 behaviour exactly — opening
    preferences and saving without changes must not change scoring.
  - "Anime conventions" toggle combined with the heuristic produces
    four states (heuristic on/off × user-flag on/off). Document
    precedence: user-flag > heuristic.

### Dependencies

Phase 2 (server reads the same keys), Phase 3 ideally (so the anime
toggle has somewhere to land).

---

## Phase 5 — Quality Profile + Cutoff system

> The headline TRaSH feature.

**Goal.** Close backlog #7. Each library/folder has a target ("1080p
Bluray Remux", "2160p WEB-DL"). Torrents above the cutoff are upgrades;
below cutoff is filtered or kept as fallback. Drives the auto-replace
flow.

### Schema changes

```sql
-- Replace qualityProfile with a richer shape:
qualityProfile {
  id              uuid pk
  name            varchar(100)
  flavor          varchar(10)         -- "movie" | "show" | "anime"
  -- Allowed combos. Each entry = a (quality, source) pair plus weight.
  allowedFormats  jsonb               -- Array<{quality, source, weight}>
                                       -- e.g. [{quality:"uhd",source:"remux",weight:100},
                                       --       {quality:"uhd",source:"bluray",weight:90},
                                       --       {quality:"fullhd",source:"remux",weight:80}]
  cutoffQuality   varchar(20)         -- e.g. "fullhd"
  cutoffSource    varchar(20)         -- e.g. "bluray"
  upgradeUntilCutoff boolean          -- auto-replace lower with higher until cutoff hit
  minScore        int                 -- absolute confidence threshold
  language        varchar(20)         -- preferred language code (overrides per-user pref)
  isDefault       boolean
  createdAt       timestamp
}

-- Folder ↔ profile binding
downloadFolder {
  ...existing...
  qualityProfileId uuid references qualityProfile(id)  -- null = use system default
}

-- media.qualityProfileId already exists; we just start populating it.
```

### Why allowedFormats/cutoff as JSONB rather than a join table

TRaSH profiles are tiny (≤8 entries). A join table buys nothing
query-wise and adds two writes per edit. JSONB is correct for an
inherently-list-shaped, edit-as-a-unit configuration.
(`folder.rules` follows the same pattern.)

### Files to touch

- `packages/db/src/schema.ts` — extend `qualityProfile`; add migration.
- `packages/core/src/domain/torrents/rules/quality.ts` — replace the
  binary `isUpgrade()` with
  `compareToProfile(candidate, profile) → { allowed, weight, atOrAboveCutoff }`.
  Keep `isUpgrade` as a thin wrapper for backward compat with
  `continuous-download.ts`.
- `packages/core/src/domain/torrents/rules/quality-profile.ts` *(new)* —
  pure helpers: `findAllowedFormat(profile, quality, source) → entry | null`,
  `meetsCutoff(profile, quality, source)`,
  `isUpgradeUnderProfile(currentVersion, candidate, profile)`.
- `packages/core/src/domain/torrents/use-cases/search-torrents.ts` —
  load active profile (media.qualityProfileId → folder default → system
  default), use it to:
  1. Filter results outside `allowedFormats` if `minScore`/strict mode
     is on.
  2. Multiply profile-derived format weight into the score (or apply
     as a +N bonus, scaled to fit `MAX_RAW`).
  3. Mark each result `aboveCutoff: boolean` for UI display.
- `packages/core/src/domain/torrents/use-cases/continuous-download.ts` —
  replace inline `preferredQuality` matching with `compareToProfile`.
- `packages/core/src/domain/torrents/use-cases/download-torrent/replace.ts`
  — gate "should we replace?" on
  `isUpgradeUnderProfile(currentMediaFile, candidate, profile)`.
- `packages/api/src/routers/profile/quality-profile.ts` *(new)* — CRUD
  procedures: `list`, `create`, `update`, `delete`, `setDefault`.
- `packages/validators/src/torrent.ts` — Zod schema for profile payload.
- `packages/core/src/infra/repositories.ts` —
  `findQualityProfileById`, `findDefaultProfileForFlavor`,
  `findFolderProfile`.

### UI

- `apps/web/src/components/settings/quality-profiles.tsx` *(new)* —
  profile editor: name, flavor selector, drag-to-reorder
  `allowedFormats` list (each row = quality + source + weight slider),
  cutoff dropdown, minScore slider, "upgrade until cutoff" toggle.
  Modeled on the rule editor in `download-folders.tsx`.
- `apps/web/src/app/(app)/manage/_components/downloads-section.tsx` —
  add "Quality Profiles" subsection above "Libraries".
- `apps/web/src/components/settings/download-folders.tsx` — add a
  "Quality Profile" select per folder.
- `apps/web/src/components/media/download/torrent-results.tsx` — show
  profile badge; mark cutoff-met rows visually.
- *(Mobile)* deferred — admins manage profiles from web.

### Data model / API impact

- **Schema:** new columns on `qualityProfile`, new FK on
  `downloadFolder`. Migration required.
- **API:** new procedure tree under `quality.*`. `torrent.search`
  response gains `aboveCutoff: boolean` and `profileWeight: number`
  (additive).
- **Mobile:** can ignore new fields.

### Effort & risks

- **Effort:** XL — schema + use-case rewrites + substantial settings
  UI.
- **Risks:**
  - **Migration of existing profiles.** The current 3-column
    `qualityProfile` rows (if any in dev DBs) need a one-shot
    conversion. Write a small `migrate-quality-profiles.ts` similar to
    `migrate-folders.ts`. Production likely has zero rows.
  - **Backward compat with `media.qualityProfileId`.** FK already
    declared but `null` everywhere. Don't backfill — let
    `searchTorrents` fall back to folder's profile when
    `media.qualityProfileId` is null. Snapshot-on-add when user picks
    a profile in the download modal.
  - **Sonarr cutoff semantics are subtle.** "Cutoff met" doesn't mean
    "stop downloading" — it means "stop *upgrading*". System still
    backfills missing episodes. Mirror that — don't treat cutoff as a
    download gate, only a no-more-upgrade gate.
  - **Combinatorial profile complexity.** 8 qualities × 8 sources × 3
    flavors = ~190 cells per profile. UI needs to be opinionated
    (default profiles like "Any UHD", "1080p Preferred", "Anime BD")
    to avoid empty-state paralysis.
  - **Score reconciliation.** Profile weight and TRaSH bonuses can
    fight (a profile heavily favouring 1080p WEB-DL scores it above
    4K Remux, defeating Phase 1's UHD penalty). Define an explicit
    blend: `final = trashScore * 0.7 + profileWeight * 0.3`
    (numbers TBD by tuning). Document the formula.

### Dependencies

Phase 3 (because flavor exists), Phase 4 (because per-folder profile
selector lives near per-folder rules editor and shares form patterns).
Auto-replace integration also wants Phase 6's repack work — see below.

---

## Phase 6 — Operational polish

> Independently shippable items.

### 6a. Repack auto-supersede

- **Files**:
  - `packages/core/src/domain/torrents/use-cases/search-torrents.ts` —
    after scoring, detect if any result is a repack of an
    already-imported file (`detectRepackCount > 0` + same release group
    + same quality/source).
  - `packages/core/src/domain/torrents/use-cases/download-torrent/replace.ts`
    — extend to take a "supersede" flag.
  - New BullMQ scheduled job that runs `searchTorrents` for
    recently-downloaded media and triggers `replaceTorrent`
    automatically when a higher-repack-count match is found.
- **Schema**: add `torrent.repackCount integer default 0` so we can
  compare without re-parsing. Optional but tidy.
- **Effort**: M.
- **Risk**: false positives. Only auto-supersede when
  `repackCount > current && releaseGroup === current && quality === current && source === current`.
  Surface the action in notifications, not silent.

### 6b. Per-indexer streaming UI

- **Files**:
  - `packages/core/src/domain/torrents/use-cases/search-torrents.ts` —
    add `searchTorrentsStreaming` returning
    `AsyncIterable<{ indexer, results }>`.
  - `packages/api/src/routers/torrent/search.ts` — add a tRPC
    subscription procedure.
  - `apps/web/src/components/media/download/torrent-results.tsx` —
    subscribe and progressively reveal indexer chips in the scanning
    state.
- **Effort**: M-L. tRPC v11 subscriptions need a transport choice (SSE
  works on Vercel; WebSockets require infra).
- **Risk**: progressive de-duplication is harder than batch. Acceptable
  to dedupe per-stream and accept small flicker.

### 6c. "Complete" fan-out

- **Files**: `searchTorrents.ts` — when `seasonNumber` is undefined and
  the show has more than one season, fire two queries (`title` and
  `title Complete`), merge, dedupe.
- **Effort**: S.
- **Risk**: doubled indexer load. Gate behind setting
  `download.completeFanout` (default off).

### 6d. AV1 codec policy

- **Files**: extend `userPreference` keys with
  `download.av1Stance: "neutral" | "prefer" | "avoid"`. Phase 4
  settings UI gets one extra select.
- **Effort**: XS.

### Dependencies

Phase 5 ideal for 6a (auto-replace wants profile cutoff to know when
to stop). 6b/6c/6d are independent.

### Effort total

M-L combined. Each item independently shippable.

---

## Sequencing summary

| Phase | Effort | Blocks  | Ship gate                                              |
| ----- | ------ | ------- | ------------------------------------------------------ |
| 1     | S × 8  | —       | Tests + visual smoke on download modal                 |
| 2     | S      | 1       | None — invisible until 4                               |
| 3     | M      | 1       | List curation reviewed                                 |
| 4     | M      | 2, 3    | Web preferences page lights up                         |
| 5     | XL     | 3, 4    | Migration + admin UI + auto-replace integration        |
| 6a    | M      | 5       | Notification UX confirmed                              |
| 6b    | M-L    | —       | Transport choice (SSE vs WS) settled                   |
| 6c    | S      | —       | Setting added                                          |
| 6d    | XS     | 4       | Pref control added                                     |

Phases 1, 2, 3 can land in a week. Phase 4 follows a few days later.
Phase 5 deserves a design review (especially the score-blend formula)
before any code lands. Phase 6 is opportunistic.

---

## Open questions before Phase 5

1. **Score blend.** TRaSH-bonuses-only vs profile-weight-only vs
   blended? Determines whether someone with a "1080p Preferred" profile
   ever sees 4K results. Recommend blended with profile dominant
   (60–70% profile weight) but configurable per-profile.
2. **Multi-language profiles.** Does "Anime BD" need a `language: "ja"`
   lock, and what does that do to multi-audio releases that contain
   JA + EN? Suggest: language pref on the profile is a *boost*, never
   a *filter*, unless the user explicitly opts in to strict.
3. **Per-folder vs per-media profile precedence.** If
   `media.qualityProfileId` conflicts with
   `downloadFolder.qualityProfileId`, which wins? Suggest media wins
   (more specific signal; UI only sets it when user picked
   deliberately).
4. **Migration of existing media files.** When a user adopts profiles
   for the first time, do we backfill `media.qualityProfileId` from
   the matching folder's default? Yes — one-shot SQL on profile
   creation.

---

## Critical files index

- `packages/core/src/domain/shared/rules/scoring.ts`
- `packages/core/src/domain/torrents/rules/parsing-release.ts`
- `packages/core/src/domain/torrents/rules/release-groups.ts`
- `packages/core/src/domain/torrents/rules/quality.ts`
- `packages/core/src/domain/torrents/use-cases/search-torrents.ts`
- `packages/core/src/domain/torrents/use-cases/continuous-download.ts`
- `packages/core/src/domain/torrents/use-cases/download-torrent/replace.ts`
- `packages/db/src/schema.ts`
- `packages/api/src/routers/torrent/search.ts`
- `apps/web/src/app/(app)/preferences/_components/`
- `apps/web/src/components/media/download/`
- `apps/web/src/components/settings/`
