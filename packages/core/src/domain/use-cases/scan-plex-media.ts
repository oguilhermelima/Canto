/* -------------------------------------------------------------------------- */
/*  Use-case: Scan Plex libraries for media items                            */
/* -------------------------------------------------------------------------- */

import type { PendingImport } from "./scan-jellyfin-media";

export interface PlexLibraryRef {
  plexLibraryId: string;
  type: string;
  linkId: string;
}

export async function scanPlexMedia(
  url: string,
  token: string,
  libs: PlexLibraryRef[],
): Promise<PendingImport[]> {
  const items: PendingImport[] = [];

  for (const lib of libs) {
    const plexPageSize = 100;
    let offset = 0;

    while (true) {
      const res = await fetch(
        `${url}/library/sections/${lib.plexLibraryId}/all?X-Plex-Token=${token}&includeGuids=1&X-Plex-Container-Start=${offset}&X-Plex-Container-Size=${plexPageSize}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) },
      );
      if (!res.ok) break;

      const data = await res.json() as {
        MediaContainer: {
          totalSize?: number;
          size?: number;
          Metadata?: Array<{
            ratingKey: string;
            title: string;
            year?: number;
            type?: string;
            Guid?: Array<{ id: string }>;
            viewCount?: number;
            viewOffset?: number;
            lastViewedAt?: number;
          }>;
        };
      };

      const metadata = data.MediaContainer.Metadata ?? [];
      for (const item of metadata) {
        let tmdbId: number | undefined;
        let imdbId: string | undefined;
        let tvdbId: number | undefined;

        for (const guid of item.Guid ?? []) {
          if (guid.id.startsWith("tmdb://")) {
            tmdbId = parseInt(guid.id.replace("tmdb://", ""), 10);
          } else if (guid.id.startsWith("imdb://")) {
            imdbId = guid.id.replace("imdb://", "");
          } else if (guid.id.startsWith("tvdb://")) {
            tvdbId = parseInt(guid.id.replace("tvdb://", ""), 10);
          }
        }

        let mediaType: "movie" | "show";
        if (lib.type === "mixed") {
          mediaType = item.type === "movie" ? "movie" : "show";
        } else {
          mediaType = lib.type === "movies" ? "movie" : "show";
        }

        const playbackPositionSeconds = item.viewOffset
          ? Math.floor(item.viewOffset / 1000)
          : undefined;

        items.push({
          tmdbId,
          imdbId,
          tvdbId,
          title: item.title,
          year: item.year,
          type: mediaType,
          libraryId: null,
          serverLinkId: lib.linkId,
          source: "plex",
          plexRatingKey: item.ratingKey,
          played: (item.viewCount ?? 0) > 0,
          playbackPositionSeconds,
          lastPlayedAt: item.lastViewedAt ? new Date(item.lastViewedAt * 1000) : undefined,
        });
      }

      offset += plexPageSize;
      const totalSize = data.MediaContainer.totalSize ?? 0;
      if (metadata.length < plexPageSize || offset >= totalSize) break;
    }
  }

  return items;
}
