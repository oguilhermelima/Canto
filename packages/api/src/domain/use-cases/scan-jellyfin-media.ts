/* -------------------------------------------------------------------------- */
/*  Use-case: Scan Jellyfin libraries for media items                        */
/* -------------------------------------------------------------------------- */

export interface JellyfinLibraryRef {
  jellyfinLibraryId: string;
  type: string;
  linkId: string;
}

export interface PendingImport {
  tmdbId?: number;
  imdbId?: string;
  title: string;
  year?: number;
  type: "movie" | "show";
  libraryId: string | null;
  serverLinkId: string;
  path?: string;
  source: "jellyfin" | "plex";
  jellyfinItemId?: string;
  plexRatingKey?: string;
}

export async function scanJellyfinMedia(
  url: string,
  apiKey: string,
  libs: JellyfinLibraryRef[],
): Promise<PendingImport[]> {
  const items: PendingImport[] = [];

  for (const lib of libs) {
    const typesToScan = lib.type === "mixed"
      ? [{ mediaType: "movie" as const, includeTypes: "Movie" }, { mediaType: "show" as const, includeTypes: "Series" }]
      : [{ mediaType: (lib.type === "movies" ? "movie" : "show") as "movie" | "show", includeTypes: lib.type === "movies" ? "Movie" : "Series" }];

    for (const { mediaType, includeTypes } of typesToScan) {
      let startIndex = 0;
      const pageSize = 500;

      try {
        while (true) {
          const res = await fetch(
            `${url}/Items?ParentId=${lib.jellyfinLibraryId}&IncludeItemTypes=${includeTypes}&Fields=ProviderIds,Path,ProductionYear&Recursive=true&StartIndex=${startIndex}&Limit=${pageSize}`,
            { headers: { "X-Emby-Token": apiKey }, signal: AbortSignal.timeout(30_000) },
          );
          if (!res.ok) {
            throw new Error(`Jellyfin API returned HTTP ${res.status} at offset ${startIndex}`);
          }

          const data = await res.json() as {
            Items: Array<{
              Id: string;
              Name: string;
              ProductionYear?: number;
              Path?: string;
              ProviderIds?: { Tmdb?: string; Imdb?: string };
            }>;
            TotalRecordCount: number;
          };

          for (const item of data.Items) {
            const tmdbStr = item.ProviderIds?.Tmdb;
            items.push({
              tmdbId: tmdbStr ? parseInt(tmdbStr, 10) : undefined,
              imdbId: item.ProviderIds?.Imdb,
              title: item.Name,
              year: item.ProductionYear,
              type: mediaType,
              libraryId: null,
              serverLinkId: lib.linkId,
              path: item.Path,
              source: "jellyfin",
              jellyfinItemId: item.Id,
            });
          }

          startIndex += pageSize;
          if (startIndex >= data.TotalRecordCount) break;
        }
      } catch (err) {
        console.warn(
          `[jellyfin-scan] Partial sync for library ${lib.jellyfinLibraryId} (${includeTypes}): ${err instanceof Error ? err.message : err}. Returning ${items.length} items fetched so far.`,
        );
      }
    }
  }

  return items;
}
