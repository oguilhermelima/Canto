import type { Database } from "@canto/db/client";
import type { CachePort } from "@canto/core/domain/shared/ports/cache";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import { GENRE_TILE_LIST } from "@canto/core/domain/recommendations/rules/genre-tiles";
import { getUserWatchPreferences } from "@canto/core/domain/shared/services/user-service";
import type { UserPreferencesPort } from "@canto/core/domain/user/ports/user-preferences.port";

const GENRE_TILES_TTL_SECONDS = 24 * 60 * 60;

export type GenreTile = {
  id: number;
  name: string;
  color: string;
  backdropPath: string | null;
};

async function pickBackdropForGenre(
  tmdb: MediaProviderPort,
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
    return {
      id: genre.movieId,
      name: genre.name,
      color: genre.color,
      backdropPath: null,
    };
  }
}

export interface GetGenreTilesDeps {
  cache: CachePort;
  tmdb: MediaProviderPort;
  userPrefs: UserPreferencesPort;
}

/**
 * Genre tiles for the discover rail: each is the curated genre plus the
 * current top backdrop in the user's region. Cached a day per (region,
 * language) to keep discover page loads cheap.
 */
export async function getGenreTiles(
  deps: GetGenreTilesDeps,
  db: Database,
  userId: string,
  overrideRegion?: string,
): Promise<GenreTile[]> {
  const prefs = await getUserWatchPreferences(deps, userId);
  const region = overrideRegion ?? prefs.watchRegion;
  return deps.cache.wrap(
    `genre-tiles:${region}:${prefs.language}`,
    GENRE_TILES_TTL_SECONDS,
    () =>
      Promise.all(
        GENRE_TILE_LIST.map((g) => pickBackdropForGenre(deps.tmdb, g, region)),
      ),
  );
}
