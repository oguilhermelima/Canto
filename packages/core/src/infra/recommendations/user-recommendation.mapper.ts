import type { userRecommendation } from "@canto/db/schema";
import type { UserId } from "@canto/core/domain/user/types/user";
import type {
  UserRecommendation,
  UserRecommendationId,
  UserRecommendationReadRow,
  UserRecommendationRow,
} from "@canto/core/domain/recommendations/types/user-recommendation";

type UserRecommendationDbRow = typeof userRecommendation.$inferSelect;
type UserRecommendationInsert = typeof userRecommendation.$inferInsert;

/** DB row → full `UserRecommendation` entity. */
export function toDomain(row: UserRecommendationDbRow): UserRecommendation {
  return {
    id: row.id as UserRecommendationId,
    userId: row.userId as UserId,
    mediaId: row.mediaId,
    weight: row.weight,
    version: row.version,
    active: row.active,
    externalId: row.externalId,
    provider: row.provider,
    type: row.type,
    title: row.title,
    overview: row.overview,
    posterPath: row.posterPath,
    backdropPath: row.backdropPath,
    logoPath: row.logoPath,
    voteAverage: row.voteAverage,
    year: row.year,
    releaseDate: row.releaseDate,
    genres: row.genres,
    genreIds: row.genreIds,
    runtime: row.runtime,
    originalLanguage: row.originalLanguage,
    contentRating: row.contentRating,
    status: row.status,
    popularity: row.popularity,
    createdAt: row.createdAt,
  };
}

/**
 * Build the insert payload for a rebuild/upsert pass. The shape mirrors the
 * `userRecommendation` insert columns and inherits version/active flags from
 * the caller (rebuild = inactive then swap, upsert = active immediately).
 */
export function toInsert(
  userId: string,
  row: UserRecommendationRow,
  version: number,
  active: boolean,
): UserRecommendationInsert {
  return {
    userId,
    mediaId: row.mediaId,
    weight: row.weight,
    version,
    active,
    externalId: row.externalId,
    provider: row.provider,
    type: row.type,
    title: row.title,
    overview: row.overview,
    posterPath: row.posterPath,
    backdropPath: row.backdropPath,
    logoPath: row.logoPath,
    voteAverage: row.voteAverage,
    year: row.year,
    releaseDate: row.releaseDate,
    genres: row.genres,
    genreIds: row.genreIds,
    runtime: row.runtime,
    originalLanguage: row.originalLanguage,
    contentRating: row.contentRating,
    status: row.status,
    popularity: row.popularity,
  };
}

interface ReadRowInput {
  id: string;
  externalId: number | null;
  provider: string | null;
  mediaType: string | null;
  title: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  genres: string[] | null;
  genreIds: number[] | null;
  trailerKey?: string | null;
  relevance: number;
}

/**
 * Narrow a raw read row to `UserRecommendationReadRow`. The query's WHERE
 * clause already guarantees `title IS NOT NULL`, and rebuilds always populate
 * `externalId` / `provider` / `type` together with `title`, so the runtime
 * filter is defensive — TS just doesn't know that.
 */
export function toReadRow(row: ReadRowInput): UserRecommendationReadRow | null {
  if (
    row.externalId === null
    || row.provider === null
    || row.mediaType === null
    || row.title === null
  ) {
    return null;
  }
  if (row.mediaType !== "movie" && row.mediaType !== "show") return null;

  return {
    id: row.id,
    externalId: row.externalId,
    provider: row.provider,
    mediaType: row.mediaType,
    title: row.title,
    overview: row.overview,
    posterPath: row.posterPath,
    backdropPath: row.backdropPath,
    logoPath: row.logoPath,
    releaseDate: row.releaseDate,
    voteAverage: row.voteAverage,
    genres: row.genres,
    genreIds: row.genreIds,
    trailerKey: row.trailerKey ?? null,
    relevance: row.relevance,
  };
}
