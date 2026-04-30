/**
 * Shared filter and cursor types for library feed queries.
 *
 * Defined here in domain so use-case input shapes can reference them without
 * importing from infra. The infra `library-feed-repository` re-exports these
 * so existing infra-internal usages keep working unchanged.
 */

export interface LibraryFeedFilterOptions {
  q?: string;
  source?: "jellyfin" | "plex" | "trakt" | "manual";
  yearMin?: number;
  yearMax?: number;
  genreIds?: number[];
  sortBy?: "recently_watched" | "name_asc" | "name_desc" | "year_desc" | "year_asc";
  scoreMin?: number;
  scoreMax?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  language?: string;
  certification?: string;
  tvStatus?: string;
  watchedFrom?: string;
  watchedTo?: string;
}

export interface ContinueWatchingFeedRow {
  id: string;
  mediaId: string;
  episodeId: string | null;
  positionSeconds: number;
  isCompleted: boolean;
  lastWatchedAt: Date;
  source: "jellyfin" | "plex" | "trakt";
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  genres: unknown;
  genreIds: unknown;
  year: number | null;
  mediaRuntime: number | null;
  externalId: number;
  provider: string;
  episodeNumber: number | null;
  episodeTitle: string | null;
  seasonNumber: number | null;
  episodeRuntime: number | null;
}

export interface ContinueWatchingKeysetCursor {
  lastWatchedAt: Date;
  id: string;
}
