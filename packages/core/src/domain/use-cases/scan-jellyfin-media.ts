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
  tvdbId?: number;
  title: string;
  year?: number;
  type: "movie" | "show";
  libraryId: string | null;
  serverLinkId: string;
  path?: string;
  source: "jellyfin" | "plex";
  jellyfinItemId?: string;
  plexRatingKey?: string;
  // User-specific data
  played?: boolean;
  playbackPositionSeconds?: number;
  lastPlayedAt?: Date;
  seasonNumber?: number;
  episodeNumber?: number;
}

interface JellyfinProviderIds {
  Tmdb?: string;
  Imdb?: string;
  Tvdb?: string;
}

interface JellyfinUserData {
  PlaybackPositionTicks?: number;
  Played?: boolean;
  LastPlayedDate?: string;
}

interface JellyfinItem {
  Id: string;
  Name: string;
  ProductionYear?: number;
  Path?: string;
  ProviderIds?: JellyfinProviderIds;
  UserData?: JellyfinUserData;
  SeriesId?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
}

function toPlaybackPositionSeconds(userData: JellyfinUserData | undefined): number | undefined {
  if (!userData?.PlaybackPositionTicks) return undefined;
  return Math.floor(userData.PlaybackPositionTicks / 10_000_000);
}

function parseJellyfinDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function fetchLibraryItems(
  url: string,
  apiKey: string,
  libraryId: string,
  includeTypes: "Movie" | "Series" | "Episode",
  jellyfinUserId?: string,
): Promise<JellyfinItem[]> {
  const pageSize = 500;
  const result: JellyfinItem[] = [];
  let startIndex = 0;

  while (true) {
    const query = new URLSearchParams({
      ParentId: libraryId,
      IncludeItemTypes: includeTypes,
      Fields: "ProviderIds,Path,ProductionYear,UserData,SeriesId,SeriesName,ParentIndexNumber,IndexNumber",
      Recursive: "true",
      StartIndex: String(startIndex),
      Limit: String(pageSize),
    });
    if (jellyfinUserId) {
      query.set("UserId", jellyfinUserId);
    }

    const res = await fetch(
      `${url}/Items?${query.toString()}`,
      { headers: { "X-Emby-Token": apiKey }, signal: AbortSignal.timeout(30_000) },
    );
    if (!res.ok) {
      throw new Error(`Jellyfin API returned HTTP ${res.status} at offset ${startIndex}`);
    }

    const data = await res.json() as {
      Items: JellyfinItem[];
      TotalRecordCount: number;
    };

    result.push(...data.Items);
    startIndex += pageSize;
    if (startIndex >= data.TotalRecordCount) break;
  }

  return result;
}

export async function scanJellyfinMedia(
  url: string,
  apiKey: string,
  libs: JellyfinLibraryRef[],
  jellyfinUserId?: string,
): Promise<PendingImport[]> {
  const items: PendingImport[] = [];

  for (const lib of libs) {
    const shouldScanMovies = lib.type === "movies" || lib.type === "mixed";
    const shouldScanShows = lib.type === "shows" || lib.type === "mixed";

    if (shouldScanMovies) {
      try {
        const movieItems = await fetchLibraryItems(
          url,
          apiKey,
          lib.jellyfinLibraryId,
          "Movie",
          jellyfinUserId,
        );
        for (const item of movieItems) {
          const tmdbStr = item.ProviderIds?.Tmdb;
          const tvdbStr = item.ProviderIds?.Tvdb;

          items.push({
            tmdbId: tmdbStr ? parseInt(tmdbStr, 10) : undefined,
            imdbId: item.ProviderIds?.Imdb,
            tvdbId: tvdbStr ? parseInt(tvdbStr, 10) : undefined,
            title: item.Name,
            year: item.ProductionYear,
            type: "movie",
            libraryId: null,
            serverLinkId: lib.linkId,
            path: item.Path,
            source: "jellyfin",
            jellyfinItemId: item.Id,
            played: item.UserData?.Played,
            playbackPositionSeconds: toPlaybackPositionSeconds(item.UserData),
            lastPlayedAt: parseJellyfinDate(item.UserData?.LastPlayedDate),
          });
        }
      } catch (err) {
        console.warn(
          `[jellyfin-scan] Partial movie sync for library ${lib.jellyfinLibraryId}: ${err instanceof Error ? err.message : err}. Returning ${items.length} items fetched so far.`,
        );
      }
    }

    if (!shouldScanShows) continue;

    try {
      const seriesItems = await fetchLibraryItems(
        url,
        apiKey,
        lib.jellyfinLibraryId,
        "Series",
        jellyfinUserId,
      );

      const seriesById = new Map(
        seriesItems.map((item) => [
          item.Id,
          {
            id: item.Id,
            title: item.Name,
            year: item.ProductionYear,
            path: item.Path,
            providerIds: item.ProviderIds,
          },
        ]),
      );

      for (const item of seriesItems) {
        const tmdbStr = item.ProviderIds?.Tmdb;
        const tvdbStr = item.ProviderIds?.Tvdb;

        items.push({
          tmdbId: tmdbStr ? parseInt(tmdbStr, 10) : undefined,
          imdbId: item.ProviderIds?.Imdb,
          tvdbId: tvdbStr ? parseInt(tvdbStr, 10) : undefined,
          title: item.Name,
          year: item.ProductionYear,
          type: "show",
          libraryId: null,
          serverLinkId: lib.linkId,
          path: item.Path,
          source: "jellyfin",
          jellyfinItemId: item.Id,
          played: item.UserData?.Played,
          playbackPositionSeconds: toPlaybackPositionSeconds(item.UserData),
          lastPlayedAt: parseJellyfinDate(item.UserData?.LastPlayedDate),
        });
      }

      const episodeItems = await fetchLibraryItems(
        url,
        apiKey,
        lib.jellyfinLibraryId,
        "Episode",
        jellyfinUserId,
      );

      for (const item of episodeItems) {
        const playbackPositionSeconds = toPlaybackPositionSeconds(item.UserData);
        const played = item.UserData?.Played === true;
        const lastPlayedAt = parseJellyfinDate(item.UserData?.LastPlayedDate);

        if (!played && !playbackPositionSeconds && !lastPlayedAt) continue;

        const seriesRef = item.SeriesId ? seriesById.get(item.SeriesId) : undefined;
        const providerIds = seriesRef?.providerIds ?? item.ProviderIds;
        const tmdbStr = providerIds?.Tmdb;
        const tvdbStr = providerIds?.Tvdb;

        items.push({
          tmdbId: tmdbStr ? parseInt(tmdbStr, 10) : undefined,
          imdbId: providerIds?.Imdb,
          tvdbId: tvdbStr ? parseInt(tvdbStr, 10) : undefined,
          title: seriesRef?.title ?? item.SeriesName ?? item.Name,
          year: seriesRef?.year ?? item.ProductionYear,
          type: "show",
          libraryId: null,
          serverLinkId: lib.linkId,
          path: item.Path ?? seriesRef?.path,
          source: "jellyfin",
          jellyfinItemId: item.SeriesId ?? seriesRef?.id ?? item.Id,
          played,
          playbackPositionSeconds,
          lastPlayedAt,
          seasonNumber: item.ParentIndexNumber,
          episodeNumber: item.IndexNumber,
        });
      }
    } catch (err) {
      console.warn(
        `[jellyfin-scan] Partial show sync for library ${lib.jellyfinLibraryId}: ${err instanceof Error ? err.message : err}. Returning ${items.length} items fetched so far.`,
      );
    }
  }

  return items;
}
