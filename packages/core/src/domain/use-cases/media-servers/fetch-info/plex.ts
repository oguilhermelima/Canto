import {
  fetchPlexItemWithMedia,
  fetchPlexShowLeavesWithMedia,
  type PlexStreamEntry,
  type PlexStreamMedia,
  type PlexStreamMetadataItem,
} from "../../../../infrastructure/adapters/media-servers/plex";
import {
  dedupeLangs,
  normalizeLang,
  normalizeResolution,
  type MediaFileInfo,
} from "./shared";

export function extractPlexFileInfo(item: PlexStreamMetadataItem): MediaFileInfo {
  const m = item.Media?.[0];
  const part = m?.Part?.[0];
  const streams = part?.Stream ?? [];

  const videoStream = streams.find((s) => s.streamType === 1);
  const audioStreams = streams.filter((s) => s.streamType === 2);
  const subtitleStreams = streams.filter((s) => s.streamType === 3);

  const defaultAudio =
    audioStreams.find((s) => s.selected) ??
    audioStreams.find((s) => s.default) ??
    audioStreams[0];

  const heightFromResolution = (() => {
    const r = m?.videoResolution?.toLowerCase();
    if (!r) return undefined;
    if (r === "4k" || r === "2160") return 2160;
    const n = parseInt(r, 10);
    return Number.isFinite(n) ? n : undefined;
  })();

  return {
    resolution: normalizeResolution(heightFromResolution),
    videoCodec: m?.videoCodec,
    audioCodec: defaultAudio?.codec ?? m?.audioCodec,
    container: m?.container,
    fileSize: part?.size,
    filePath: part?.file,
    bitrate: m?.bitrate,
    durationMs: part?.duration ?? m?.duration,
    hdr: detectPlexHdr(m, videoStream),
    primaryAudioLang: normalizeLang(
      defaultAudio?.languageTag ?? defaultAudio?.languageCode ?? defaultAudio?.language,
    ),
    audioLangs: dedupeLangs(
      audioStreams.map((s) => s.languageTag ?? s.languageCode ?? s.language),
    ),
    subtitleLangs: dedupeLangs(
      subtitleStreams.map((s) => s.languageTag ?? s.languageCode ?? s.language),
    ),
  };
}

function detectPlexHdr(
  media: PlexStreamMedia | undefined,
  videoStream: PlexStreamEntry | undefined,
): string | undefined {
  if (media?.videoDoViPresent || videoStream?.DOVIPresent) return "DolbyVision";
  const dynamicRange = media?.videoDynamicRange?.toLowerCase();
  if (dynamicRange?.includes("dolby")) return "DolbyVision";
  if (dynamicRange?.includes("hdr10+")) return "HDR10+";
  if (dynamicRange?.includes("hdr")) return "HDR10";
  const trc = (videoStream?.colorTrc ?? "").toLowerCase();
  if (trc === "smpte2084") return "HDR10";
  if (trc.includes("arib-std-b67")) return "HLG";
  const primaries = (videoStream?.colorPrimaries ?? "").toLowerCase();
  if (primaries === "bt2020" || primaries === "bt2020nc") return "HDR10";
  return undefined;
}

export async function fetchPlexMediaInfo(
  url: string,
  token: string,
  ratingKey: string,
  type: "movie" | "show",
): Promise<MediaFileInfo[]> {
  if (type === "movie") {
    const item = await fetchPlexItemWithMedia(url, token, ratingKey);
    return item ? [extractPlexFileInfo(item)] : [];
  }

  const leaves = await fetchPlexShowLeavesWithMedia(url, token, ratingKey);
  return leaves.map((ep) => {
    const info = extractPlexFileInfo(ep);
    info.seasonNumber = ep.parentIndex;
    info.episodeNumber = ep.index;
    info.serverEpisodeId = ep.ratingKey;
    return info;
  });
}
