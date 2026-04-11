/* -------------------------------------------------------------------------- */
/*  Use-case: fetch media file info (resolution, codecs, HDR, languages,     */
/*  duration, bitrate) from Jellyfin / Plex.                                  */
/*                                                                            */
/*  Both server APIs expose enough stream-level detail to classify quality   */
/*  beyond "1080p h264". We normalize into a provider-agnostic MediaFileInfo */
/*  shape so the sync pipeline can persist it verbatim.                      */
/* -------------------------------------------------------------------------- */

function normalizeResolution(height?: number | null): string | undefined {
  if (!height) return undefined;
  if (height >= 2160) return "4K";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  return "SD";
}

export interface MediaFileInfo {
  seasonNumber?: number;
  episodeNumber?: number;
  serverEpisodeId?: string;
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  fileSize?: number;
  filePath?: string;
  bitrate?: number;
  durationMs?: number;
  hdr?: string;
  primaryAudioLang?: string;
  audioLangs?: string[];
  subtitleLangs?: string[];
}

/* -------------------------------------------------------------------------- */
/*  Jellyfin                                                                   */
/* -------------------------------------------------------------------------- */

interface JellyfinMediaStream {
  Type: string;
  Codec?: string;
  Height?: number;
  Width?: number;
  BitDepth?: number;
  VideoRange?: string;
  VideoRangeType?: string;
  Language?: string;
  IsDefault?: boolean;
}

interface JellyfinMediaSource {
  Container?: string;
  Size?: number;
  Path?: string;
  Bitrate?: number;
  MediaStreams?: JellyfinMediaStream[];
}

interface JellyfinItem {
  Id: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  RunTimeTicks?: number;
  MediaSources?: JellyfinMediaSource[];
}

const JELLYFIN_FIELDS = "MediaSources,MediaStreams,RunTimeTicks";

export function extractJellyfinFileInfo(item: JellyfinItem): MediaFileInfo {
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

function detectJellyfinHdr(stream: JellyfinMediaStream | undefined): string | undefined {
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
  const headers = { "X-Emby-Token": apiKey };
  const results: MediaFileInfo[] = [];

  if (type === "movie") {
    const res = await fetch(`${url}/Items/${itemId}?Fields=${JELLYFIN_FIELDS}`, { headers });
    if (!res.ok) return [];
    const data = (await res.json()) as JellyfinItem;
    results.push(extractJellyfinFileInfo(data));
  } else {
    let startIndex = 0;
    while (true) {
      const res = await fetch(
        `${url}/Shows/${itemId}/Episodes?Fields=${JELLYFIN_FIELDS}&StartIndex=${startIndex}&Limit=500`,
        { headers },
      );
      if (!res.ok) break;
      const data = (await res.json()) as {
        Items: JellyfinItem[];
        TotalRecordCount: number;
      };
      for (const ep of data.Items) {
        const info = extractJellyfinFileInfo(ep);
        info.seasonNumber = ep.ParentIndexNumber;
        info.episodeNumber = ep.IndexNumber;
        info.serverEpisodeId = ep.Id;
        results.push(info);
      }
      startIndex += 500;
      if (startIndex >= data.TotalRecordCount) break;
    }
  }

  return results;
}

/* -------------------------------------------------------------------------- */
/*  Plex                                                                       */
/* -------------------------------------------------------------------------- */

interface PlexStream {
  streamType: number; // 1 = video, 2 = audio, 3 = subtitle
  codec?: string;
  default?: boolean;
  selected?: boolean;
  language?: string;
  languageCode?: string;
  languageTag?: string;
  colorPrimaries?: string;
  colorTrc?: string;
  DOVIPresent?: boolean;
}

interface PlexPart {
  file?: string;
  size?: number;
  duration?: number;
  Stream?: PlexStream[];
}

interface PlexMedia {
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  bitrate?: number;
  duration?: number;
  height?: number;
  videoResolution?: string;
  videoDynamicRange?: string;
  videoDoViPresent?: boolean;
  Part?: PlexPart[];
}

interface PlexMetadataItem {
  ratingKey: string;
  parentIndex?: number;
  index?: number;
  Media?: PlexMedia[];
}

export function extractPlexFileInfo(item: PlexMetadataItem): MediaFileInfo {
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
  media: PlexMedia | undefined,
  videoStream: PlexStream | undefined,
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
  const results: MediaFileInfo[] = [];
  const headers = { Accept: "application/json", "X-Plex-Token": token };

  if (type === "movie") {
    const res = await fetch(
      `${url}/library/metadata/${ratingKey}?includeMedia=1`,
      { headers },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      MediaContainer: { Metadata?: PlexMetadataItem[] };
    };
    const item = data.MediaContainer.Metadata?.[0];
    if (item) results.push(extractPlexFileInfo(item));
  } else {
    const res = await fetch(
      `${url}/library/metadata/${ratingKey}/allLeaves?includeMedia=1`,
      { headers },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      MediaContainer: { Metadata?: PlexMetadataItem[] };
    };
    for (const ep of data.MediaContainer.Metadata ?? []) {
      const info = extractPlexFileInfo(ep);
      info.seasonNumber = ep.parentIndex;
      info.episodeNumber = ep.index;
      info.serverEpisodeId = ep.ratingKey;
      results.push(info);
    }
  }

  return results;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeLang(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  return raw.replace("_", "-");
}

function dedupeLangs(raw: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  for (const lang of raw) {
    const normalized = normalizeLang(lang);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}
