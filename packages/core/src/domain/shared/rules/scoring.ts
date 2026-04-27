import type { Quality, ConfidenceContext } from "../../torrents/types/common";
import { detectSource } from "../../torrents/rules/quality";
import {
  detectCodec,
  detectAudioCodec,
  detectHdrFormat,
  detectReleaseGroup,
  detectRepackCount,
  isHybridRelease,
} from "../../torrents/rules/parsing-release";
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

/**
 * TRaSH-aligned confidence score (0–100).
 *
 * Components (max raw 160):
 *   Health (0–40)         — seeder count, dead-torrent guard
 *   Quality (0–30)        — UHD > FullHD > HD > SD
 *   Source (−40 to +15)   — Remux > BluRay > WEB-DL > … > Telesync > CAM
 *   Codec (0–12)          — context-aware: H.265 rewarded only for UHD,
 *                           H.264 preferred at 1080p/720p, AV1 rewarded
 *   HDR (0–12)            — DV > HDR10+ > HDR10 > HDR > HLG
 *   Audio (0–10)          — TrueHD Atmos > DTS-HD MA > TrueHD > DTS-HD > …
 *   Freshness (0–10)      — newer releases preferred
 *   Group tier (−20 to +12) — TRaSH-style HQ vs LQ release groups
 *   Repack/Proper (0–6)   — fix releases beat the broken original
 *   Hybrid (0–3)          — best-of-both BluRay+WEB
 *   Bonus flags (0–7)     — freeleech, double-upload
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
  // H.265 at those resolutions is usually a re-encode (lossy on lossy).
  const codec = detectCodec(title);
  if (quality === "uhd") {
    if (codec === "h265") score += 12;
    else if (codec === "av1") score += 10;
    else if (codec === "h264") score += 4;
  } else {
    if (codec === "h264") score += 10;
    else if (codec === "av1") score += 8;
    else if (codec === "h265") score += 4;
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

  // HDR (0–12) — DV is the most demanding format; HDR10+ adds dynamic metadata.
  const hdr = detectHdrFormat(title);
  if (hdr === "DV") score += 12;
  else if (hdr === "HDR10+") score += 10;
  else if (hdr === "HDR10") score += 8;
  else if (hdr === "HDR") score += 5;
  else if (hdr === "HLG") score += 3;

  // Audio (0–10)
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

  // Freshness (0–10)
  if (age <= 1) score += 10;
  else if (age <= 7) score += 8;
  else if (age <= 30) score += 5;
  else if (age <= 90) score += 3;
  else if (age <= 365) score += 1;

  // Release group tier (−20 to +12)
  const group = detectReleaseGroup(title);
  const tier = classifyReleaseGroup(group);
  if (tier === "gold") score += 12;
  else if (tier === "avoid") score -= 20;

  // Repack / Proper (0–6) — newer fix releases beat the broken original.
  const repackCount = detectRepackCount(title);
  if (repackCount > 0) score += Math.min(6, repackCount * 3);

  // Hybrid releases (combo BluRay + WEB) — TRaSH rewards them.
  if (isHybridRelease(title)) score += 3;

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
  // when all bonuses align (UHD remux DV TrueHD-Atmos gold-group repack…).
  const MAX_RAW = 160;
  const normalized = Math.round((score / MAX_RAW) * 100);
  return Math.max(0, Math.min(100, normalized));
}
