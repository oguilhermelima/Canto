/* -------------------------------------------------------------------------- */
/*  Use-case: Fetch media file info (resolution, codec, etc.) from servers   */
/* -------------------------------------------------------------------------- */

function normalizeResolution(height?: number): string | undefined {
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
    const res = await fetch(`${url}/Items/${itemId}?Fields=MediaSources`, { headers });
    if (!res.ok) return [];
    const data = await res.json() as {
      MediaSources?: Array<{
        Container?: string;
        Size?: number;
        Path?: string;
        MediaStreams?: Array<{ Type: string; Height?: number; Codec?: string }>;
      }>;
    };
    const src = data.MediaSources?.[0];
    if (src) {
      const videoStream = src.MediaStreams?.find((s) => s.Type === "Video");
      const audioStream = src.MediaStreams?.find((s) => s.Type === "Audio");
      results.push({
        resolution: normalizeResolution(videoStream?.Height),
        videoCodec: videoStream?.Codec,
        audioCodec: audioStream?.Codec,
        container: src.Container,
        fileSize: src.Size,
        filePath: src.Path,
      });
    }
  } else {
    let startIndex = 0;
    while (true) {
      const res = await fetch(
        `${url}/Shows/${itemId}/Episodes?Fields=MediaSources&StartIndex=${startIndex}&Limit=500`,
        { headers },
      );
      if (!res.ok) break;
      const data = await res.json() as {
        Items: Array<{
          Id: string;
          ParentIndexNumber?: number;
          IndexNumber?: number;
          MediaSources?: Array<{
            Container?: string;
            Size?: number;
            Path?: string;
            MediaStreams?: Array<{ Type: string; Height?: number; Codec?: string }>;
          }>;
        }>;
        TotalRecordCount: number;
      };
      for (const ep of data.Items) {
        const src = ep.MediaSources?.[0];
        const videoStream = src?.MediaStreams?.find((s) => s.Type === "Video");
        const audioStream = src?.MediaStreams?.find((s) => s.Type === "Audio");
        results.push({
          seasonNumber: ep.ParentIndexNumber,
          episodeNumber: ep.IndexNumber,
          serverEpisodeId: ep.Id,
          resolution: normalizeResolution(videoStream?.Height),
          videoCodec: videoStream?.Codec,
          audioCodec: audioStream?.Codec,
          container: src?.Container,
          fileSize: src?.Size,
          filePath: src?.Path,
        });
      }
      startIndex += 500;
      if (startIndex >= data.TotalRecordCount) break;
    }
  }

  return results;
}

export async function fetchPlexMediaInfo(
  url: string,
  token: string,
  ratingKey: string,
  type: "movie" | "show",
): Promise<MediaFileInfo[]> {
  const results: MediaFileInfo[] = [];

  if (type === "movie") {
    const res = await fetch(`${url}/library/metadata/${ratingKey}?X-Plex-Token=${token}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      MediaContainer: {
        Metadata?: Array<{
          Media?: Array<{
            videoCodec?: string;
            audioCodec?: string;
            container?: string;
            Part?: Array<{ size?: number; file?: string; height?: number }>;
          }>;
        }>;
      };
    };
    const item = data.MediaContainer.Metadata?.[0];
    const m = item?.Media?.[0];
    const part = m?.Part?.[0];
    results.push({
      resolution: normalizeResolution(part?.height),
      videoCodec: m?.videoCodec,
      audioCodec: m?.audioCodec,
      container: m?.container,
      fileSize: part?.size,
      filePath: part?.file,
    });
  } else {
    const res = await fetch(`${url}/library/metadata/${ratingKey}/allLeaves?X-Plex-Token=${token}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      MediaContainer: {
        Metadata?: Array<{
          ratingKey: string;
          parentIndex?: number;
          index?: number;
          Media?: Array<{
            videoCodec?: string;
            audioCodec?: string;
            container?: string;
            Part?: Array<{ size?: number; file?: string; height?: number }>;
          }>;
        }>;
      };
    };
    for (const ep of data.MediaContainer.Metadata ?? []) {
      const m = ep.Media?.[0];
      const part = m?.Part?.[0];
      results.push({
        seasonNumber: ep.parentIndex,
        episodeNumber: ep.index,
        serverEpisodeId: ep.ratingKey,
        resolution: normalizeResolution(part?.height),
        videoCodec: m?.videoCodec,
        audioCodec: m?.audioCodec,
        container: m?.container,
        fileSize: part?.size,
        filePath: part?.file,
      });
    }
  }

  return results;
}
