import {
  fetchJellyfinItemWithStreams,
  fetchJellyfinShowEpisodesWithStreams,
  type JellyfinStreamItem,
  type JellyfinStreamMediaStream,
} from "../../../../infra/media-servers/jellyfin.adapter";
import {
  dedupeLangs,
  normalizeLang,
  normalizeResolution,
  type MediaFileInfo,
} from "./shared";

export function extractJellyfinFileInfo(item: JellyfinStreamItem): MediaFileInfo {
  const src = item.MediaSources?.[0];
  const streams = src?.MediaStreams ?? [];
  const videoStream = streams.find((s) => s.Type === "Video");
  const audioStreams = streams.filter((s) => s.Type === "Audio");
  const subtitleStreams = streams.filter((s) => s.Type === "Subtitle");

  const defaultAudio = audioStreams.find((s) => s.IsDefault) ?? audioStreams[0];

  return {
    resolution: normalizeResolution(videoStream?.Height),
    videoCodec: videoStream?.Codec,
    audioCodec: defaultAudio?.Codec,
    container: src?.Container,
    fileSize: src?.Size,
    filePath: src?.Path,
    bitrate: src?.Bitrate,
    durationMs:
      item.RunTimeTicks != null ? Math.floor(item.RunTimeTicks / 10_000) : undefined,
    hdr: detectJellyfinHdr(videoStream),
    primaryAudioLang: normalizeLang(defaultAudio?.Language),
    audioLangs: dedupeLangs(audioStreams.map((s) => s.Language)),
    subtitleLangs: dedupeLangs(subtitleStreams.map((s) => s.Language)),
  };
}

function detectJellyfinHdr(
  stream: JellyfinStreamMediaStream | undefined,
): string | undefined {
  if (!stream) return undefined;
  const rangeType = (stream.VideoRangeType ?? "").toLowerCase();
  const range = (stream.VideoRange ?? "").toLowerCase();
  if (rangeType.includes("dovi") || rangeType.includes("dolby")) return "DolbyVision";
  if (rangeType.includes("hdr10+") || rangeType.includes("plus")) return "HDR10+";
  if (rangeType.includes("hdr10") || range === "hdr") return "HDR10";
  if (rangeType.includes("hlg")) return "HLG";
  return undefined;
}

export async function fetchJellyfinMediaInfo(
  url: string,
  apiKey: string,
  itemId: string,
  type: "movie" | "show",
): Promise<MediaFileInfo[]> {
  if (type === "movie") {
    const item = await fetchJellyfinItemWithStreams(url, apiKey, itemId);
    return item ? [extractJellyfinFileInfo(item)] : [];
  }

  const episodes = await fetchJellyfinShowEpisodesWithStreams(url, apiKey, itemId);
  return episodes.map((ep) => {
    const info = extractJellyfinFileInfo(ep);
    info.seasonNumber = ep.ParentIndexNumber;
    info.episodeNumber = ep.IndexNumber;
    info.serverEpisodeId = ep.Id;
    return info;
  });
}
