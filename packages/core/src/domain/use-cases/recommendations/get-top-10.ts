import type { Database } from "@canto/db/client";
import { cached } from "../../../infrastructure/cache/redis";
import { getTmdbProvider } from "../../../lib/tmdb-client";
import { getUserWatchPreferences } from "../../services/user-service";
import type { SearchResult } from "@canto/providers";

export type Top10Result = {
  region: string;
  movies: SearchResult[];
  shows: SearchResult[];
};

/**
 * Top 10 trending movies + shows for the user's region, keyed by language
 * so different locales get their own ranking. Cached 30 minutes.
 */
export async function getTop10(
  db: Database,
  userId: string,
  overrideRegion?: string,
): Promise<Top10Result> {
  const prefs = await getUserWatchPreferences(db, userId);
  const region = overrideRegion ?? prefs.watchRegion;
  return cached(`top10:${region}:${prefs.language}`, 30 * 60, async () => {
    const tmdb = await getTmdbProvider();
    const [movies, shows] = await Promise.all([
      tmdb.getTrending("movie", { timeWindow: "day", language: prefs.language, page: 1 }),
      tmdb.getTrending("show", { timeWindow: "day", language: prefs.language, page: 1 }),
    ]);
    return {
      region,
      movies: movies.results.slice(0, 10),
      shows: shows.results.slice(0, 10),
    };
  });
}
