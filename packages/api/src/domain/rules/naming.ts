import { formatQualityLabel, formatSourceLabel } from "./quality";

export const VIDEO_EXTENSIONS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".m4v",
  ".ts",
]);

export function isVideoFile(name: string): boolean {
  const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

export function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\.+$/, "")
    .trim();
}

export interface MediaNamingInfo {
  title: string;
  year: number | null;
  externalId: number;
  provider: string;
  type: string;
}

export interface FileNameOptions {
  seasonNumber?: number;
  episodeNumber?: number;
  quality?: string;
  source?: string;
  extension: string;
}

export function buildVersionTag(quality: string, source: string): string {
  const qLabel = formatQualityLabel(quality as Parameters<typeof formatQualityLabel>[0]);
  const sLabel = formatSourceLabel(source as Parameters<typeof formatSourceLabel>[0]);
  return [qLabel, sLabel].filter(Boolean).join(" ");
}

export function buildMediaDir(
  media: MediaNamingInfo,
  seasonNumber?: number,
): string {
  const safeTitle = sanitizeName(media.title);
  const yearSuffix = media.year ? ` (${media.year})` : "";
  const providerTag = media.provider === "tmdb" ? "tmdbid" : media.provider;
  const idTag = `[${providerTag}-${media.externalId}]`;
  const baseName = `${safeTitle}${yearSuffix} ${idTag}`;

  if (media.type === "movie") {
    return baseName;
  }

  const seasonPadded = String(seasonNumber ?? 1).padStart(2, "0");
  return `${baseName}/Season ${seasonPadded}`;
}

export function buildFileName(
  media: MediaNamingInfo,
  opts: FileNameOptions,
): string {
  const safeTitle = sanitizeName(media.title);
  const yearSuffix = media.year ? ` (${media.year})` : "";
  const versionTag = buildVersionTag(opts.quality ?? "unknown", opts.source ?? "unknown");
  const versionSuffix = versionTag ? ` - [${versionTag}]` : "";

  if (media.type === "show" && opts.seasonNumber != null && opts.episodeNumber != null) {
    const sn = String(opts.seasonNumber).padStart(2, "0");
    const en = String(opts.episodeNumber).padStart(2, "0");
    return `${safeTitle}${yearSuffix} - S${sn}E${en}${versionSuffix}${opts.extension}`;
  }

  return `${safeTitle}${yearSuffix}${versionSuffix}${opts.extension}`;
}
