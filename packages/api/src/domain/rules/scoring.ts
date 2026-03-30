import type { Quality, ConfidenceContext } from "../types/common";
import { detectSource } from "./quality";

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

  // Health (0–40) — log-scale seeders
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

  // Encoding (0–15)
  if (/\b(h\.?265|hevc|x\.?265)\b/i.test(lower)) score += 15;
  else if (/\b(h\.?264|x\.?264|avc)\b/i.test(lower)) score += 8;

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

  // Freshness (0–10)
  if (age <= 1) score += 10;
  else if (age <= 7) score += 8;
  else if (age <= 30) score += 5;
  else if (age <= 90) score += 3;
  else if (age <= 365) score += 1;

  // Bonus (0–5)
  const lowerFlags = flags.map((f) => f.toLowerCase());
  if (
    lowerFlags.includes("freeleech") ||
    lowerFlags.includes("freeleech75")
  ) {
    score += 5;
  }

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

  // Normalize to 0–100
  const MAX_RAW = 115;
  const normalized = Math.round((score / MAX_RAW) * 100);
  return Math.max(0, Math.min(100, normalized));
}
