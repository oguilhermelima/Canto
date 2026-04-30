import type { UserId } from "@canto/core/domain/user/types/user";

export type UserRecommendationId = string
  & { readonly __brand: "UserRecommendationId" };

/** `media.type` discriminator carried on the denormalized row. */
export type UserRecommendationMediaType = "movie" | "show";

/**
 * Full `user_recommendation` row. Mirrors the table 1:1 — denormalized media
 * columns stay nullable because the read path filters on `title IS NOT NULL`
 * and the daily safety-net rebuild self-heals stale rows.
 */
export interface UserRecommendation {
  id: UserRecommendationId;
  userId: UserId;
  mediaId: string;
  weight: number;
  version: number;
  active: boolean;
  externalId: number | null;
  provider: string | null;
  type: string | null;
  title: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  voteAverage: number | null;
  year: number | null;
  releaseDate: string | null;
  genres: string[] | null;
  genreIds: number[] | null;
  runtime: number | null;
  originalLanguage: string | null;
  contentRating: string | null;
  status: string | null;
  popularity: number | null;
  createdAt: Date;
}

/**
 * Write shape carried through `rebuildUserRecommendations` /
 * `upsertUserRecommendations`. Everything past `weight` is denormalized
 * directly from the source `media` row so the read path can skip the JOIN.
 */
export interface UserRecommendationRow {
  mediaId: string;
  weight: number;
  externalId: number | null;
  provider: string | null;
  type: string | null;
  title: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  voteAverage: number | null;
  year: number | null;
  releaseDate: string | null;
  genres: string[] | null;
  genreIds: number[] | null;
  runtime: number | null;
  originalLanguage: string | null;
  contentRating: string | null;
  status: string | null;
  popularity: number | null;
}

/**
 * Read projection returned by `findUserRecommendations` / `findUserSpotlightItems`.
 * Fields guaranteed by the WHERE clause (`title IS NOT NULL` implies the row was
 * populated by the denormalizing rebuild) are narrowed to non-null so callers
 * don't have to re-check.
 */
export interface UserRecommendationReadRow {
  id: string;
  externalId: number;
  provider: string;
  mediaType: UserRecommendationMediaType;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  genres: string[] | null;
  genreIds: number[] | null;
  trailerKey: string | null;
  relevance: number;
}
