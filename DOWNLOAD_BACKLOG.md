# Download flow — TRaSH alignment & known gaps

Tracking what's still missing vs the TRaSH guides for the torrent-search/download
flow, plus UI items intentionally deferred from earlier polish passes. Anything
already shipped is documented inline next to the gap so you can tell what's done
vs pending at a glance.

The scoring code lives in:
- `packages/core/src/domain/shared/rules/scoring.ts` — `calculateConfidence()`
- `packages/core/src/domain/torrents/rules/parsing-release.ts` — detection helpers
- `packages/core/src/domain/torrents/rules/release-groups.ts` — tier list
- `packages/core/src/domain/torrents/use-cases/search-torrents.ts` — orchestration

UI lives in:
- `apps/web/src/components/media/download/download-modal.tsx`
- `apps/web/src/components/media/download/download-tab.tsx`
- `apps/web/src/components/media/download/torrent-results.tsx`
- `apps/web/src/components/media/download/season-select.tsx`

---

## Already shipped (TRaSH-aligned)

For reference, so future passes don't re-do existing work.

- [x] Health / seeders (log-scale, dead-torrent guard)
- [x] Quality hierarchy (UHD > FullHD > HD > SD)
- [x] Source hierarchy (Remux > BluRay > WEB-DL > WEBRip > HDTV) + Telesync/CAM penalty
- [x] Codec context-aware: HEVC rewarded only at UHD, x264 preferred at HD/FullHD, AV1 small bonus
- [x] HDR scoring (DV > HDR10+ > HDR10 > HDR > HLG)
- [x] Audio codec scoring (TrueHD Atmos > DTS-HD MA > TrueHD > … > AAC)
- [x] Freshness bonus (≤1d / ≤7d / ≤30d / ≤90d / ≤365d)
- [x] Release group tier (gold / avoid / neutral) — curated TRaSH-style lists
- [x] Repack/Proper/Rerip detection + bonus (scaled by count)
- [x] Hybrid release bonus
- [x] Indexer flag bonuses (freeleech / freeleech75 / halfleech / freeleech25 / doubleupload)
- [x] CAM keyword scan with `hasDigitalRelease` context
- [x] Nuked penalty
- [x] 0-seeder skip

---

## High impact — next pass

### 1. UHD-without-HDR penalty
**What:** Today 4K SDR always beats 1080p HDR (quality +30 outweighs quality +25 + HDR +5). TRaSH penalises UHD-without-HDR because the bandwidth cost isn't justified by the resolution alone.

**Where:** `scoring.ts` — after the HDR block, add `if (quality === "uhd" && !hdr) score -= 10;`

**Effort:** 2 lines.

---

### 2. Streaming service tags (NF / AMZN / ATVP / DSNP / HMAX / HULU)
**What:** WEB-DL releases carry tags identifying the streaming source. Quality varies meaningfully between services (Netflix tends to push higher bitrates than HBO Max, Disney+ caps low, Amazon variable). TRaSH custom-format "Streaming Services" lets users prefer specific ones.

**Where:**
- `parsing-release.ts`: add `detectStreamingService(title)` returning `"NF" | "AMZN" | "ATVP" | "DSNP" | "HMAX" | "HULU" | "PCOK" | "STAN" | null`.
- `parsing.ts`: re-export.
- `scoring.ts`: small bonus (+2..+4) for each, configurable later via user prefs.

**Effort:** ~20 lines, no settings UI yet.

---

### 3. Audio channel scoring (5.1 / 7.1)
**What:** `detectAudioChannels()` already exists at `parsing-release.ts:86` but is never read. TRaSH bonuses 7.1 > 5.1 > 2.0.

**Where:** `scoring.ts` — call it, add `+3 / +2 / +0` respectively.

**Effort:** 5 lines.

---

### 4. Multi-audio / dual-track bonus
**What:** Releases with the `MULTi` or `DUAL` token carry multiple language tracks. `detectLanguages()` in `parsing-languages.ts` already maps these but the result doesn't reach scoring.

**Where:** `scoring.ts` — read `detectLanguages(title)`, add small bonus if length > 1 or if `multi`/`dual` token present.

**Effort:** ~10 lines.

---

## Medium impact

### 5. Sub-tiered release groups (Tier 01 / 02 / 03)
**What:** Currently classify groups as `gold | avoid | neutral`. TRaSH splits gold further — Tier 01 (FLUX, NTb, BMF, DON, EbP) > Tier 02 (KiNGS, RAWR, MZABI) > Tier 03 (KOGi, GLHF). Granularity sharpens score.

**Where:** `release-groups.ts` — switch return type to a small enum or weight number.

**Effort:** ~30 lines, mostly list curation.

---

### 6. DV with HDR10 fallback vs DV-only
**What:** Pure Dolby Vision plays only on DV-capable TVs. DV with HDR10 fallback layer plays on any HDR TV. TRaSH prefers DV+HDR10 fallback. Today we collapse both into the `"DV"` bucket.

**Where:** `parsing-release.ts` — `detectHdrFormat` should distinguish `"DV"` (pure) vs `"DV-HDR10"` (with fallback). Patterns differ: `dv hdr10` vs just `dv`/`dovi`.

**Effort:** ~15 lines + test cases.

---

### 7. Quality profile / cutoff (target quality system)
**What:** TRaSH's most defining feature: each library has a target ("1080p BluRay Remux", "2160p WEB-DL", etc). Anything above target is an upgrade; anything below is skipped or only kept if nothing else exists. Today we do absolute ranking without a target concept.

**Where:** Big — would affect `searchTorrents()`, the UI (per-library setting), maybe the auto-replace flow.

**Effort:** Large — feature-sized. Defer until there's product demand.

---

### 8. Combo bonuses (UHD Remux DV Atmos)
**What:** TRaSH's "UHD Bluray Remux Tier" custom format bonuses the *combination* of UHD + Remux + DV + lossless audio. Today bonuses are additive, so a release with all four already wins, but the explicit combo guarantees an unbeatable score.

**Where:** `scoring.ts` — after individual bonuses, add a combo check: `if (quality === "uhd" && source === "remux" && hdr === "DV" && audio.includes("Atmos")) score += 5;`

**Effort:** 5 lines. Optional polish.

---

## Low impact / nice-to-have

### 9. Edition signal scoring (IMAX / Director's Cut / Extended)
**What:** `detectEdition()` exists (`parsing-release.ts:94`) but unused. TRaSH treats edition as a user-preference signal — not everyone wants Extended cuts.

**Where:** Need user prefs first. Without prefs, neutral. Defer until settings UI for downloads exists.

**Effort:** Medium — needs UI.

---

### 10. Hybrid tier (real Hybrid vs token-only)
**What:** Currently any title containing `hybrid` gets +3. Some scene releases lazy-tag as Hybrid without the actual BD/WEB merge. Real Hybrid = both sources + diff metadata.

**Where:** `parsing-release.ts` — tighten `isHybridRelease` heuristic, or accept the small false-positive cost.

**Effort:** Marginal. Probably skip.

---

### 11. Anime-specific scoring track
**What:** TRaSH publishes a separate anime guide. Anime releases use different conventions:
- Different group tier list (Vodes, Kulot, MTBB are top — already in our gold list, but no distinction)
- Multi-audio is more meaningful (DUAL = JP + EN dub)
- BluRay releases lag months behind WEB but are dramatically better
- Sub group convention (`-Group [resolution]` vs `Group-resolution`)

**Where:** Would need `mediaType === "anime"` (we don't track this — anime is currently `type === "show"`). Would need a flag on the media record or a heuristic from genre.

**Effort:** Medium — touches data model. Defer.

---

### 12. Repack auto-supersede
**What:** Today repack/proper gives a +6 score bonus, that's it. TRaSH-driven Sonarr will auto-replace an existing download with its repack. We have a `replace` flow already (used for quality upgrades) — could extend it to auto-trigger when a repack lands.

**Where:** `searchTorrents` + the BullMQ scheduler. Cross-cutting.

**Effort:** Medium-large.

---

### 13. User-preferred languages
**What:** `detectLanguages` returns the language list but the user has no way to express which they care about. TRaSH lets you boost releases matching your preferred languages.

**Where:** Needs user prefs UI. Without that, can't score sensibly.

**Effort:** Settings UI + scoring hook.

---

### 14. AV1 codec policy
**What:** Today AV1 gets `+10` at UHD, `+8` at HD/FullHD. Reasonable default. TRaSH still hasn't solidified its AV1 stance — will revisit when codec adoption matures.

**Status:** Live with current scoring.

---

## Deferred UI work

### 15. Per-indexer streaming in the scanning state
**What:** The "Pinging the cosmos" loading state currently shows a generic radar pulse. Original ambition: light up indexer chips as each indexer responds (`Promise.allSettled` reveals nothing per-indexer until the whole batch resolves).

**Why deferred:** Would require:
- Streaming endpoint (tRPC subscription) or per-indexer parallel queries from the client.
- Probably a `useQueries` per indexer instead of one `torrent.search`.
- Backend refactor of `searchTorrents` to fan-out and stream results.

**Where:**
- `packages/core/src/domain/torrents/use-cases/search-torrents.ts` — needs streaming variant.
- `packages/api/src/routers/torrent/search.ts` — add subscription procedure.
- `apps/web/src/components/media/download/torrent-results.tsx` — wire chips into `ScanningState`.

**Effort:** Medium-large. Defer until product demand or a slow indexer becomes a real complaint.

---

### 16. "Complete" token in full-show search
**What:** When the user picks "Full show", the query is just the title. Some indexers return episodes mixed with packs. Sonarr/Prowlarr add tokens like `Complete` or `S01-S05` to bias toward season packs.

**Why deferred:** Risk of *over*-filtering — many legit packs don't carry the `Complete` token, so adding it would drop them. The smarter fix is to fan-out two queries (`title` + `title Complete`) and dedupe — more work than just changing the query string.

**Where:** `searchTorrents()` in the `if (input.seasonNumber === undefined && !isCustomQuery)` branch.

**Effort:** Small if going fan-out, but with extra indexer load. Defer.

---

## Suggested next pass

Highest leverage per hour: items **1, 2, 3, 4** (UHD-no-HDR penalty, streaming services,
audio channels, multi-audio). Together ~50 lines, no UI changes, score gets noticeably
closer to a stock TRaSH config.

After that: **5** (sub-tiered groups) is the next clean win — pure list curation, no
new logic.

Everything else either needs settings UI (7, 9, 13) or backend refactors (12, 15).
