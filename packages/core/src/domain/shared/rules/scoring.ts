import type { Quality, ConfidenceContext } from "../../torrents/types/common";
import { detectSource } from "../../torrents/rules/quality";
import {
  detectCodec,
  detectAudioCodec,
  detectHdrFormat,
  detectAudioChannels,
  detectReleaseGroup,
  detectRepackCount,
  detectStreamingService,
  isHybridRelease,
} from "../../torrents/rules/parsing-release";
import { detectLanguages } from "../../torrents/rules/parsing-languages";
import { classifyReleaseGroup } from "../../torrents/rules/release-groups";

export const CAM_KEYWORDS = [
  "cam",
  "camrip",
  "bdscr",
  "ddc",
  "dvdscreener",
  "dvdscr",
  "hdcam",
  "hdtc",
  "hdts",
  "scr",
  "screener",
  "telesync",
  "ts",
  "webscreener",
  "tc",
  "telecine",
  "tvrip",
];

const STREAMING_LANGUAGE_META = new Set(["multi", "dual", "multi-subs"]);

/**
 * TRaSH-aligned confidence score (0–100).
 *
 * Components (max raw 170):
 *   Health (0–40)            — seeder count, dead-torrent guard
 *   Quality (0–30)           — UHD > FullHD > HD > SD
 *   Source (−40 to +15)      — Remux > BluRay > WEB-DL > … > Telesync > CAM
 *   Codec (0–12)             — context-aware: H.265 rewarded only for UHD,
 *                              H.264 preferred at 1080p/720p (H.265 there
 *                              gets 0 — TRaSH treats it as a re-encode
 *                              signal), AV1 rewarded everywhere.
 *   HDR (−10 to +13)         — DV-HDR10 > DV > HDR10+ > HDR10 ≈ HDR > HLG.
 *                              Unqualified "HDR" is treated as HDR10 (the
 *                              baseline) since untagged HDR is almost
 *                              always HDR10. UHD without HDR is penalised
 *                              (−10) since 4K SDR doesn't justify the
 *                              bandwidth cost.
 *   Audio codec (0–10)       — TrueHD Atmos > DTS-HD MA > TrueHD > … > AAC
 *   Audio channels (0–3)     — 7.1 > 5.1 > 2.0
 *   Multi-audio (0–2)        — MULTi/DUAL token or two+ language tracks
 *   Streaming source (0–1)   — small static bonus for known streaming tags
 *                              (NF/AMZN/ATVP/DSNP/HMAX/HULU/PCOK/STAN/PMTP/CR);
 *                              Phase 2 promotes this to user-configurable
 *   Freshness (0–10)         — newer releases preferred
 *   Group tier (−40 to +12)  — TRaSH HQ groups boosted; LQ groups buried.
 *                              Avoid penalty matches TRaSH's "this group
 *                              should never win unless nothing else exists".
 *   Repack/Proper (0–6)      — fix releases beat the broken original
 *   Hybrid (0–3)             — best-of-both BluRay+WEB
 *   Combo bonus (0–5)        — UHD Remux + DV/DV-HDR10 + Atmos jackpot
 *   Bonus flags (0–7)        — freeleech, double-upload
 *
 * Penalties (additive on top, can drive score below 0):
 *   CAM keywords: −80 if a digital release should exist, else −15
 *   Nuked flag:   −100
 */
export function calculateConfidence(
  title: string,
  quality: Quality,
  flags: string[],
  seeders: number,
  age: number,
  ctx: ConfidenceContext,
): number {
  const lower = title.toLowerCase();
  let score = 0;

  // Health (0–40) — log-scale seeders, 0 seeders = dead torrent
  if (seeders === 0) return 0;
  if (seeders >= 500) score += 40;
  else if (seeders >= 100) score += 35;
  else if (seeders >= 50) score += 30;
  else if (seeders >= 20) score += 25;
  else if (seeders >= 10) score += 20;
  else if (seeders >= 5) score += 15;
  else if (seeders >= 1) score += 8;

  // Quality (0–30)
  switch (quality) {
    case "uhd":
      score += 30;
      break;
    case "fullhd":
      score += 25;
      break;
    case "hd":
      score += 15;
      break;
    case "sd":
      score += 5;
      break;
  }

  // Codec (0–12) — context-aware. TRaSH rewards H.264 at HD/FullHD because
  // H.265 at those resolutions is usually a re-encode (lossy on lossy);
  // H.265 there earns nothing.
  const codec = detectCodec(title);
  if (quality === "uhd") {
    if (codec === "h265") score += 12;
    else if (codec === "av1") score += 10;
    else if (codec === "h264") score += 4;
  } else {
    if (codec === "h264") score += 10;
    else if (codec === "av1") score += 8;
    // H.265 / HEVC at non-UHD: no bonus. The implicit gap to h264
    // (+10) is the TRaSH-aligned "prefer x264 here" signal.
  }

  // Source (−40 to +15)
  const source = detectSource(title);
  switch (source) {
    case "remux":
      score += 15;
      break;
    case "bluray":
      score += 12;
      break;
    case "webdl":
      score += 10;
      break;
    case "webrip":
      score += 7;
      break;
    case "hdtv":
      score += 5;
      break;
    case "telesync":
      score -= 20;
      break;
    case "cam":
      score -= 40;
      break;
  }

  // HDR (0–13) — DV with HDR10 fallback ranks above pure DV because pure DV
  // black-frames on non-DV displays. Unqualified "HDR" collapses into the
  // HDR10 score because in indexer titles it almost always means HDR10.
  const hdr = detectHdrFormat(title);
  if (hdr === "DV-HDR10") score += 13;
  else if (hdr === "DV") score += 12;
  else if (hdr === "HDR10+") score += 10;
  else if (hdr === "HDR10" || hdr === "HDR") score += 8;
  else if (hdr === "HLG") score += 3;

  // UHD-without-HDR penalty — 4K SDR isn't worth the bandwidth, TRaSH ranks
  // it below 1080p HDR.
  if (quality === "uhd" && !hdr) score -= 10;

  // Audio codec (0–10)
  const audio = detectAudioCodec(title);
  if (audio === "TrueHD Atmos") score += 10;
  else if (audio === "DTS-HD MA") score += 9;
  else if (audio === "TrueHD") score += 8;
  else if (audio === "DTS-HD") score += 7;
  else if (audio === "DTS") score += 5;
  else if (audio === "FLAC") score += 4;
  else if (audio === "EAC3") score += 3;
  else if (audio === "AC3") score += 2;
  else if (audio === "AAC") score += 1;

  // Audio channels (0–3)
  const channels = detectAudioChannels(title);
  if (channels === "7.1") score += 3;
  else if (channels === "5.1") score += 2;

  // Multi / dual audio (0–2). Either an explicit MULTi/DUAL token OR at
  // least two non-meta language codes. Capped so we don't double-reward.
  const languages = detectLanguages(title);
  const hasMultiToken =
    languages.includes("multi") || languages.includes("dual");
  const distinctLangs = languages.filter(
    (l) => !STREAMING_LANGUAGE_META.has(l),
  ).length;
  if (hasMultiToken) score += 2;
  else if (distinctLangs >= 2) score += 1;

  // Streaming service (0–1) — small static bonus for tagged WEB-DL/WEBRip
  // releases. Phase 2 will turn this into a per-user configurable boost.
  const streamingService = detectStreamingService(title);
  if (streamingService) score += 1;

  // Freshness (0–10)
  if (age <= 1) score += 10;
  else if (age <= 7) score += 8;
  else if (age <= 30) score += 5;
  else if (age <= 90) score += 3;
  else if (age <= 365) score += 1;

  // Release group tier (−40 to +12). Avoid penalty is large enough that an
  // LQ-group release should never win against a neutral-group equivalent.
  const group = detectReleaseGroup(title);
  const tier = classifyReleaseGroup(group);
  if (tier === "gold") score += 12;
  else if (tier === "avoid") score -= 40;

  // Repack / Proper (0–6) — newer fix releases beat the broken original.
  const repackCount = detectRepackCount(title);
  if (repackCount > 0) score += Math.min(6, repackCount * 3);

  // Hybrid releases (combo BluRay + WEB) — TRaSH rewards them.
  if (isHybridRelease(title)) score += 3;

  // Combo jackpot (+5) — UHD Remux with Dolby Vision (fallback or pure)
  // and TrueHD Atmos audio. Stacks on top of the individual bonuses so
  // this release outranks any near-equivalent.
  if (
    quality === "uhd" &&
    source === "remux" &&
    (hdr === "DV-HDR10" || hdr === "DV") &&
    audio === "TrueHD Atmos"
  ) {
    score += 5;
  }

  // Indexer flag bonuses (0–7)
  const lowerFlags = flags.map((f) => f.toLowerCase());
  if (lowerFlags.includes("freeleech")) score += 5;
  else if (lowerFlags.includes("freeleech75")) score += 4;
  else if (lowerFlags.includes("halfleech")) score += 3;
  else if (lowerFlags.includes("freeleech25")) score += 2;
  if (lowerFlags.includes("doubleupload")) score += 2;

  // Penalties
  let isCam = false;
  for (const kw of CAM_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(lower)) {
      isCam = true;
      break;
    }
  }
  if (isCam) {
    score -= ctx.hasDigitalRelease ? 80 : 15;
  }

  if (lowerFlags.includes("nuked")) score -= 100;

  // Normalize to 0–100. MAX_RAW reflects the achievable positive ceiling
  // when every bonus aligns (UHD Remux DV-HDR10 TrueHD-Atmos 7.1 streaming
  // gold-group repack hybrid combo + freeleech + doubleupload).
  const MAX_RAW = 170;
  const normalized = Math.round((score / MAX_RAW) * 100);
  return Math.max(0, Math.min(100, normalized));
}
