import type { mediaRecommendation } from "@canto/db/schema";
import type {
  BecauseWatched,
  BecauseWatchedId,
  BecauseWatchedRec,
} from "@canto/core/domain/recommendations/types/because-watched";

type MediaRecommendationRow = typeof mediaRecommendation.$inferSelect;

/** DB row → full `BecauseWatched` entity. */
export function toDomain(row: MediaRecommendationRow): BecauseWatched {
  return {
    id: row.id as BecauseWatchedId,
    mediaId: row.mediaId,
    sourceMediaId: row.sourceMediaId,
    sourceType: row.sourceType,
    createdAt: row.createdAt,
  };
}

interface BecauseWatchedRecInput {
  sourceMediaId: string;
  mediaId: string;
  externalId: number;
  provider: string;
  type: string;
  title: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  year: number | null;
  releaseDate: string | null;
  genreIds: number[] | null;
  trailerKey: string | null;
  rank: number;
  fallbackTitle: string;
  localizedTitle: string | null;
  localizedOverview: string | null;
  localizedPosterPath: string | null;
  localizedLogoPath: string | null;
}

/**
 * Build a `BecauseWatchedRec` projection from a raw window-function row plus
 * the localization overlay. Rows whose `type` isn't a known media discriminator
 * are rejected so callers don't need to re-narrow.
 */
export function toBecauseWatchedRec(
  input: BecauseWatchedRecInput,
): BecauseWatchedRec | null {
  if (input.type !== "movie" && input.type !== "show") return null;
  return {
    sourceMediaId: input.sourceMediaId,
    mediaId: input.mediaId,
    externalId: input.externalId,
    provider: input.provider,
    type: input.type,
    title: input.localizedTitle ?? input.title ?? input.fallbackTitle,
    posterPath: input.localizedPosterPath ?? input.posterPath,
    backdropPath: input.backdropPath,
    logoPath: input.localizedLogoPath ?? input.logoPath,
    overview: input.localizedOverview ?? input.overview,
    voteAverage: input.voteAverage,
    year: input.year,
    releaseDate: input.releaseDate,
    genreIds: input.genreIds,
    trailerKey: input.trailerKey,
    rank: input.rank,
  };
}
