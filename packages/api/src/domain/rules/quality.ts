import type { Quality, Source } from "../types/common";

export const QUALITY_HIERARCHY = [
  "uhd",
  "fullhd",
  "hd",
  "sd",
  "unknown",
] as const;

export const SOURCE_HIERARCHY = [
  "remux",
  "bluray",
  "webdl",
  "webrip",
  "hdtv",
  "telesync",
  "cam",
  "unknown",
] as const;

export function detectQuality(title: string): Quality {
  const lower = title.toLowerCase();
  if (lower.includes("2160p") || lower.includes("4k") || lower.includes("uhd"))
    return "uhd";
  if (lower.includes("1080p") || lower.includes("fullhd")) return "fullhd";
  if (lower.includes("720p")) return "hd";
  if (lower.includes("480p") || lower.includes("360p")) return "sd";
  return "unknown";
}

export function detectSource(title: string): Source {
  const lower = title.toLowerCase();
  if (/\bremux\b/.test(lower)) return "remux";
  if (/\b(blu[\s.-]?ray|bdrip|brrip)\b/.test(lower)) return "bluray";
  if (/\bweb[\s.-]?dl\b/.test(lower)) return "webdl";
  if (/\bwebrip\b/.test(lower)) return "webrip";
  if (/\b(hdtv|pdtv|dsr)\b/.test(lower)) return "hdtv";
  if (/\b(telesync|hdts|ts(?:rip)?)\b/.test(lower)) return "telesync";
  if (/\b(cam|hdcam|camrip)\b/.test(lower)) return "cam";
  return "unknown";
}

export function isUpgrade(
  current: { quality: Quality; source: Source },
  candidate: { quality: Quality; source: Source },
): boolean {
  const qCurrent = QUALITY_HIERARCHY.indexOf(current.quality);
  const qCandidate = QUALITY_HIERARCHY.indexOf(candidate.quality);

  if (qCandidate < qCurrent) return true;
  if (qCandidate > qCurrent) return false;

  const sCurrent = SOURCE_HIERARCHY.indexOf(current.source);
  const sCandidate = SOURCE_HIERARCHY.indexOf(candidate.source);
  return sCandidate < sCurrent;
}

export function formatQualityLabel(quality: Quality): string {
  switch (quality) {
    case "uhd":
      return "4K";
    case "fullhd":
      return "1080p";
    case "hd":
      return "720p";
    case "sd":
      return "SD";
    default:
      return "";
  }
}

export function formatSourceLabel(source: Source): string {
  switch (source) {
    case "remux":
      return "Remux";
    case "bluray":
      return "Blu-Ray";
    case "webdl":
      return "WEB-DL";
    case "webrip":
      return "WEBRip";
    case "hdtv":
      return "HDTV";
    case "telesync":
      return "TS";
    case "cam":
      return "CAM";
    default:
      return "";
  }
}
