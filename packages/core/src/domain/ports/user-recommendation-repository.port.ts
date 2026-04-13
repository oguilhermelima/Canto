export interface RecsFilters {
  genreIds?: number[];
  genreMode?: "and" | "or";
  language?: string;
  scoreMin?: number;
  scoreMax?: number;
  yearMin?: string;
  yearMax?: string;
  runtimeMin?: number;
  runtimeMax?: number;
  certification?: string;
  status?: string;
  sortBy?: string;
  watchProviders?: string;
  watchRegion?: string;
}

interface RecommendationItem {
  id: string;
  externalId: number;
  provider: string;
  mediaType: string;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  genres: unknown;
  genreIds: unknown;
  trailerKey: string | null;
  relevance: number;
}

interface SpotlightItem {
  id: string;
  externalId: number;
  provider: string;
  mediaType: string;
  title: string;
  overview: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  genres: unknown;
  genreIds: unknown;
  relevance: number;
}

export interface UserRecommendationRepositoryPort {
  rebuildUserRecommendations(
    userId: string,
    rows: Array<{ mediaId: string; weight: number }>,
  ): Promise<void>;

  upsertUserRecommendations(
    userId: string,
    rows: Array<{ mediaId: string; weight: number }>,
  ): Promise<void>;

  findUserRecommendations(
    userId: string,
    excludeItems: Array<{ externalId: number; provider: string }>,
    limit: number,
    offset: number,
    filters?: RecsFilters,
  ): Promise<RecommendationItem[]>;

  countUserRecommendations(userId: string): Promise<number>;

  deleteUserRecommendationsForSource(
    userId: string,
    sourceMediaId: string,
  ): Promise<void>;

  removeMediaFromUserRecs(userId: string, mediaId: string): Promise<void>;

  findUsersForDailyRecsCheck(): Promise<Array<{ id: string }>>;

  findUserSpotlightItems(
    userId: string,
    excludeItems: Array<{ externalId: number; provider: string }>,
    limit: number,
  ): Promise<SpotlightItem[]>;
}
