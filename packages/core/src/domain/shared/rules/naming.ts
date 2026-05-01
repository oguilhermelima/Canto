import { formatQualityLabel, formatSourceLabel } from "../../torrents/rules/quality";
import { detectCodec, detectAudioCodec, detectAudioChannels, detectHdrFormat, detectEdition, detectReleaseGroup } from "../../torrents/rules/parsing";

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
  /** End of episode range — when present, formats as S01E01-E03 */
  episodeEndNumber?: number;
  episodeTitle?: string;
  quality?: string;
  source?: string;
  /** Original torrent title — used to detect codec, audio codec, edition, and release group */
  torrentTitle?: string;
  extension: string;
}

export function buildVersionTag(quality: string, source: string): string {
  const qLabel = formatQualityLabel(quality as Parameters<typeof formatQualityLabel>[0]);
  const sLabel = formatSourceLabel(source as Parameters<typeof formatSourceLabel>[0]);
  // TRaSH format: Source-Quality (e.g. "WEB-DL-1080p", "Bluray-1080p", "Remux-2160p")
  return [sLabel, qLabel].filter(Boolean).join("-");
}

export function buildMediaDir(
  media: MediaNamingInfo,
  seasonNumber?: number,
): string {
  const safeTitle = sanitizeName(media.title);
  const yearSuffix = media.year ? ` (${media.year})` : "";
  const providerTag = media.provider === "tvdb" ? "tvdbid" : "tmdbid";
  const idTag = `[${providerTag}-${media.externalId}]`;
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
 * Pattern: `[{Source}-{Quality} {AudioCodec}][{VideoCodec}]{-ReleaseGroup}`
 * Examples: `[WEB-DL-1080p DTS][h265]-FLUX`, `[Remux-2160p TrueHD Atmos][h265]`
 */
function buildQualitySuffix(
  quality: string,
  source: string,
  torrentTitle?: string,
): string {
  const versionTag = buildVersionTag(quality, source);
  const audioCodec = torrentTitle ? detectAudioCodec(torrentTitle) : null;
  const audioChannels = torrentTitle ? detectAudioChannels(torrentTitle) : null;
  const videoCodec = torrentTitle ? detectCodec(torrentTitle) : null;
  const hdrFormat = torrentTitle ? detectHdrFormat(torrentTitle) : null;
  const releaseGroup = torrentTitle ? detectReleaseGroup(torrentTitle) : null;

  // Audio label: "DTS 5.1", "TrueHD Atmos 7.1", or just "DTS"
  const audioLabel = [audioCodec, audioChannels].filter(Boolean).join(" ");

  let suffix = "";
  // Quality bracket: [Source-Quality AudioCodec Channels]
  const qualityParts = [versionTag, audioLabel].filter(Boolean).join(" ");
  if (qualityParts) suffix += `[${qualityParts}]`;
  // Video bracket: [h265 HDR10] or [h265]
  const videoParts = [videoCodec, hdrFormat].filter(Boolean).join(" ");
  if (videoParts) suffix += `[${videoParts}]`;
  if (releaseGroup) suffix += `-${releaseGroup}`;

  return suffix;
}

export function buildFileName(
  media: MediaNamingInfo,
  opts: FileNameOptions,
): string {
  const safeTitle = sanitizeName(media.title);
  const yearSuffix = media.year ? ` (${media.year})` : "";
  const edition = opts.torrentTitle ? detectEdition(opts.torrentTitle) : null;
  const editionTag = edition ? ` {edition-${edition}}` : "";
  const qualitySuffix = buildQualitySuffix(
    opts.quality ?? "unknown",
    opts.source ?? "unknown",
    opts.torrentTitle,
  );

  if (media.type === "show" && opts.seasonNumber !== undefined && opts.episodeNumber !== undefined) {
    const sn = String(opts.seasonNumber).padStart(2, "0");
    const en = String(opts.episodeNumber).padStart(2, "0");
    const epRange = opts.episodeEndNumber !== undefined && opts.episodeEndNumber > opts.episodeNumber
      ? `-E${String(opts.episodeEndNumber).padStart(2, "0")}`
      : "";
    const epTitle = opts.episodeTitle ? ` - ${sanitizeName(opts.episodeTitle)}` : "";
    const qs = qualitySuffix ? ` ${qualitySuffix}` : "";
    return `${safeTitle}${yearSuffix} - S${sn}E${en}${epRange}${epTitle}${qs}${opts.extension}`;
  }

  const qs = qualitySuffix ? ` ${qualitySuffix}` : "";
  return `${safeTitle}${yearSuffix}${editionTag}${qs}${opts.extension}`;
}
