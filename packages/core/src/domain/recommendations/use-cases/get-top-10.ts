import type { Database } from "@canto/db/client";
import type { CachePort } from "@canto/core/domain/shared/ports/cache";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import { getUserWatchPreferences } from "@canto/core/domain/shared/services/user-service";
import type { SearchResult } from "@canto/providers";

const TOP_10_TTL_SECONDS = 30 * 60;

export type Top10Result = {
  region: string;
  movies: SearchResult[];
  shows: SearchResult[];
};

export interface GetTop10Deps {
  cache: CachePort;
  tmdb: MediaProviderPort;
}

/**
 * Top 10 trending movies + shows for the user's region, keyed by language
 * so different locales get their own ranking. Cached 30 minutes.
 */
export async function getTop10(
  deps: GetTop10Deps,
  db: Database,
  userId: string,
  overrideRegion?: string,
): Promise<Top10Result> {
  const prefs = await getUserWatchPreferences(db, userId);
  const region = overrideRegion ?? prefs.watchRegion;
  return deps.cache.wrap(
    `top10:${region}:${prefs.language}`,
    TOP_10_TTL_SECONDS,
    async () => {
      const [movies, shows] = await Promise.all([
        deps.tmdb.getTrending("movie", {
          timeWindow: "day",
          language: prefs.language,
          page: 1,
        }),
        deps.tmdb.getTrending("show", {
          timeWindow: "day",
          language: prefs.language,
          page: 1,
        }),
      ]);
      return {
        region,
        movies: movies.results.slice(0, 10),
        shows: shows.results.slice(0, 10),
      };
    },
  );
}
