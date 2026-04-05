import { formatQualityLabel, formatSourceLabel } from "./quality";
import { detectCodec, detectReleaseGroup } from "./parsing";

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
  episodeTitle?: string;
  quality?: string;
  source?: string;
  /** Original torrent title — used to detect codec and release group */
  torrentTitle?: string;
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
  const idTag = `[tmdbid-${media.externalId}]`;
  const baseName = `${safeTitle}${yearSuffix} ${idTag}`;

  if (media.type === "movie") {
    return baseName;
  }

  const seasonPadded = String(seasonNumber ?? 1).padStart(2, "0");
  return `${baseName}/Season ${seasonPadded}`;
}

/**
 * Build a quality/codec/group suffix following TRaSH Guides naming.
 *
 * Pattern: `[{Quality} {Source}][{Codec}]{-ReleaseGroup}`
 * Examples: `[1080p WEB-DL][h265]-FLUX`, `[4K Remux][h265]`
 */
function buildQualitySuffix(
  quality: string,
  source: string,
  torrentTitle?: string,
): string {
  const versionTag = buildVersionTag(quality, source);
  const codec = torrentTitle ? detectCodec(torrentTitle) : null;
  const releaseGroup = torrentTitle ? detectReleaseGroup(torrentTitle) : null;

  let suffix = "";
  if (versionTag) suffix += `[${versionTag}]`;
  if (codec) suffix += `[${codec}]`;
  if (releaseGroup) suffix += `-${releaseGroup}`;

  return suffix;
}

export function buildFileName(
  media: MediaNamingInfo,
  opts: FileNameOptions,
): string {
  const safeTitle = sanitizeName(media.title);
  const yearSuffix = media.year ? ` (${media.year})` : "";
  const qualitySuffix = buildQualitySuffix(
    opts.quality ?? "unknown",
    opts.source ?? "unknown",
    opts.torrentTitle,
  );

  if (media.type === "show" && opts.seasonNumber != null && opts.episodeNumber != null) {
    const sn = String(opts.seasonNumber).padStart(2, "0");
    const en = String(opts.episodeNumber).padStart(2, "0");
    const epTitle = opts.episodeTitle ? ` - ${sanitizeName(opts.episodeTitle)}` : "";
    const qs = qualitySuffix ? ` ${qualitySuffix}` : "";
    return `${safeTitle}${yearSuffix} - S${sn}E${en}${epTitle}${qs}${opts.extension}`;
  }

  const qs = qualitySuffix ? ` ${qualitySuffix}` : "";
  return `${safeTitle}${yearSuffix}${qs}${opts.extension}`;
}
