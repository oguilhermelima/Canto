# Download flow — TRaSH alignment status

Snapshot of what's shipped, what's parked, and where in the codebase
each piece lives. Refreshed after Phase 6.

Scoring lives in:
- `packages/core/src/domain/shared/rules/scoring.ts` — `calculateConfidence()` engine
- `packages/core/src/domain/shared/rules/scoring-rules.ts` — `ScoringRules` shape + `DEFAULT_SCORING_RULES`
- `packages/core/src/domain/shared/rules/media-flavor.ts` — flavor heuristic
- `packages/core/src/domain/torrents/rules/parsing-release.ts` — detection helpers
- `packages/core/src/domain/torrents/rules/release-attributes.ts` — parser composer
- `packages/core/src/domain/torrents/rules/release-groups.ts` — tier list
- `packages/core/src/domain/torrents/rules/quality-profile.ts` — profile model + cutoff helpers
- `packages/core/src/domain/torrents/use-cases/search-torrents.ts` — orchestration
- `packages/core/src/infra/torrents/quality-profile-repository.ts` — DB layer

UI lives in:
- `apps/web/src/components/media/download/*` — download modal flow
- `apps/web/src/app/(app)/manage/_components/quality-profiles-section.tsx` — profile editor
- `apps/web/src/app/(app)/manage/_components/download-preferences-section.tsx` — per-user prefs
- `apps/web/src/components/settings/download-folders.tsx` — per-folder profile selector

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
- [x] Pure engine (`calculateConfidence`) consuming attrs + ctx + rules
- [x] Layered overlays: defaults → user prefs → quality profile → engine

### Per-user preferences (overlay onto rules)
- [x] Preferred languages (boost matching releases)
- [x] Preferred streaming services (boost tagged releases)
- [x] Preferred / avoided editions
- [x] AV1 codec stance (neutral / prefer / avoid)
- [x] Settings UI under `/manage` → Storage → Download Preferences

### Quality Profile + Cutoff
- [x] Schema: `quality_profile` (allowedFormats / cutoff / minTotalScore / flavor / isDefault) + `download_folder.quality_profile_id` FK
- [x] Profile applied as engine overlay; combos outside `allowedFormats` are rejected
- [x] Resolution chain: `media.qualityProfileId` → `folder.qualityProfileId` → system default per flavor → none
- [x] `aboveCutoff` flag exposed on every search result + UI badge
- [x] `compareToProfile` helper for upgrade decisions
- [x] tRPC `qualityProfile.{list, get, create, update, delete, setDefault, seed}`
- [x] Editor UI in `/manage` → Storage → Quality Profiles
- [x] Per-folder profile selector in the Libraries editor
- [x] Default profiles seedable in one click (one per flavor, marked default)

### Search query construction
- [x] ID-based (tmdbId/imdbId/tvdbId) + season/episode tokens
- [x] Full-show fan-out: title + `${title} Complete` (catches season packs indexed under "Complete")
- [x] Custom query: text-only, ID params skipped

### Data plumbing
- [x] `torrent.repackCount` persisted at download time — sets up data for the auto-supersede job (Phase 6a full version, deferred)

---

## Parked / not shipped

### Phase 6a — Repack auto-supersede (full)
**What's done:** `torrent.repack_count` column populated when a download
starts (commit `9c98d1b8`).

**What's missing:**
- BullMQ scheduled job that scans recently-downloaded media for repack
  upgrades using the persisted `repackCount`.
- Replace flow gating on `compareToProfile` so the auto-replace only
  triggers when the candidate is a strict upgrade under the active
  profile.
- Notification UX for "We just superseded X with REPACK".

**Effort:** M. Defer until repack triage by hand becomes painful.

### Phase 6b — Per-indexer streaming in the scanning state
**What:** Replace the batch `Promise.allSettled` indexer fan-out with a
streaming flow so the scanning UI can light up per-indexer chips as
each indexer responds.

**Why parked:** Needs a tRPC subscription transport (SSE on Vercel; WS
elsewhere), a streaming variant of `searchTorrents`, and progressive
de-duplication on the client. Net cost is high; payoff is a polish
improvement on a screen the user sees for ~5 seconds per search.

**Effort:** M-L. Defer until a slow indexer becomes a real complaint
or until tRPC subscriptions land for an unrelated reason.

### Anime-specific scoring tweaks
**What:** Source preference flattening (BluRay isn't strictly > WEB-DL
for anime), bigger `dual` audio bonus, smaller freshness factor when
flavor is anime.

**Why parked:** The anime tier list (Phase 3) already differentiates
anime release-group preferences. The remaining tweaks are second-order
and need real-world signal to tune sensibly.

**Effort:** S each. Add when anime users report bad rankings.

### Strict language filter on profiles
**What:** Today profile language preference is a *boost* (per-user
languageBonuses). Some users want a *filter* — "Anime BD profile only
accepts Japanese audio".

**Why parked:** Roadmap intentionally avoided strict-mode in v1 to
avoid over-filtering. Add as an opt-in flag per profile when demand
emerges.

**Effort:** S.

### Custom group overrides (per-instance)
**What:** Currently the tier lists in `release-groups.ts` are baked
into code. Power users with niche tastes (or non-public-tracker users
who follow specific groups) might want to add a group to T1 or
demote a group to avoid without forking.

**Why parked:** Solvable with a `release_group_override` JSONB table
that overlays the curated lists at classification time. Nobody has
asked for it yet.

**Effort:** M (table + repo + UI + apply at classification).

### TRaSH guides JSON import
**What:** Sonarr/Radarr users can import TRaSH's published JSON
custom-format definitions directly. Replicating that would let our
defaults track upstream automatically.

**Why parked:** Format-translation work; TRaSH's JSON references
Sonarr-specific concepts (custom formats, indexer flags) that don't
1:1 map to our model.

**Effort:** L.

---

## Scoring decisions worth remembering

- **MAX_RAW = 170**, calibrated from the achievable positive ceiling
  with all signals aligned. If a future addition breaks this, recompute
  before shipping.
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
