/**
 * Shared filter, cursor, and projection types for library feed queries.
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

export interface UserPlaybackProgressFeedRow {
  id: string;
  mediaId: string;
  episodeId: string | null;
  positionSeconds: number;
  isCompleted: boolean;
  lastWatchedAt: Date | null;
  source: string | null;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  userRating: number | null;
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

export interface UserWatchHistoryFeedRow {
  id: string;
  mediaId: string;
  episodeId: string | null;
  watchedAt: Date;
  source: string | null;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  voteAverage: number | null;
  userRating: number | null;
  externalId: number;
  provider: string;
  episodeNumber: number | null;
  episodeTitle: string | null;
  seasonNumber: number | null;
}

export interface UserListMediaCandidateRow {
  listId: string;
  listName: string;
  listType: string;
  addedAt: Date;
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  releaseDate: string | null;
  externalId: number;
  provider: string;
  airsTime: string | null;
  originCountry: string[] | null;
}

export interface UserMediaPaginatedRow {
  mediaId: string;
  status: string | null;
  rating: number | null;
  isFavorite: boolean;
  stateUpdatedAt: Date;
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
  externalId: number;
  provider: string;
}

export interface UserMediaPaginatedPage {
  items: UserMediaPaginatedRow[];
  total: number;
}

export interface UserMediaCounts {
  planned: number;
  watching: number;
  completed: number;
  dropped: number;
  favorites: number;
  rated: number;
  hidden: number;
}

export interface LibraryGenre {
  id: number;
  name: string;
}

export interface UserWatchHistoryByMediaRow {
  id: string;
  mediaId: string;
  episodeId: string | null;
  watchedAt: Date;
  source: string | null;
}

export interface EpisodeByMediaRow {
  mediaId: string;
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
  airDate: string | null;
}

export interface CompletedPlaybackEpisodeRow {
  mediaId: string;
  episodeId: string | null;
  isCompleted: boolean;
}

export interface WatchingShowMetadataRow {
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  lastActivityAt: Date | null;
}

export interface UserMediaStateByMediaRow {
  mediaId: string;
  status: string | null;
  rating: number | null;
  updatedAt: Date;
}

export interface UserMediaPaginatedQuery {
  status?: string;
  hasRating?: boolean;
  isFavorite?: boolean;
  isHidden?: boolean;
  mediaType?: "movie" | "show";
  sortBy?: "updatedAt" | "rating" | "title" | "year";
  sortOrder?: "asc" | "desc";
  limit: number;
  offset: number;
}

export interface ContinueWatchingFeedQuery {
  limit: number;
  cursor?: ContinueWatchingKeysetCursor | null;
  mediaType?: "movie" | "show";
  filters?: LibraryFeedFilterOptions;
}
