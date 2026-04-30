import type { Database } from "@canto/db/client";
import { cached } from "@canto/core/platform/cache/redis";
import { GENRE_TILE_LIST } from "@canto/core/domain/recommendations/rules/genre-tiles";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getUserWatchPreferences } from "@canto/core/domain/shared/services/user-service";

export type GenreTile = {
  id: number;
  name: string;
  color: string;
  backdropPath: string | null;
};

async function pickBackdropForGenre(
  tmdb: Awaited<ReturnType<typeof getTmdbProvider>>,
  genre: (typeof GENRE_TILE_LIST)[number],
  region: string,
): Promise<GenreTile> {
  try {
    const disc = await tmdb.discover("movie", {
      genreIds: String(genre.movieId),
      sort_by: "popularity.desc",
      watchRegion: region,
      page: 1,
    });
    const withBackdrop = disc.results.find((r) => r.backdropPath);
    return {
      id: genre.movieId,
      name: genre.name,
      color: genre.color,
      backdropPath: withBackdrop?.backdropPath ?? null,
    };
  } catch {
    return { id: genre.movieId, name: genre.name, color: genre.color, backdropPath: null };
  }
}

/**
 * Genre tiles for the discover rail: each is the curated genre plus the
 * current top backdrop in the user's region. Cached a day per (region,
 * language) to keep discover page loads cheap.
 */
export async function getGenreTiles(
  db: Database,
  userId: string,
  overrideRegion?: string,
): Promise<GenreTile[]> {
  const prefs = await getUserWatchPreferences(db, userId);
  const region = overrideRegion ?? prefs.watchRegion;
  return cached(`genre-tiles:${region}:${prefs.language}`, 24 * 3600, async () => {
    const tmdb = await getTmdbProvider();
    return Promise.all(
      GENRE_TILE_LIST.map((g) => pickBackdropForGenre(tmdb, g, region)),
    );
  });
}
