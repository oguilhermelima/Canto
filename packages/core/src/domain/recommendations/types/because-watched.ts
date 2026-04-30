export type BecauseWatchedId = string & { readonly __brand: "BecauseWatchedId" };

/**
 * Full `media_recommendation` row. Captures the M:N relationship between a
 * source media (the seed) and a recommended media. The "because watched"
 * read path projects this through a join with `media` to surface denormalized
 * metadata for the recommended item.
 */
export interface BecauseWatched {
  id: BecauseWatchedId;
  mediaId: string;
  sourceMediaId: string;
  sourceType: string;
  createdAt: Date;
}

/**
 * Read projection returned by `findBecauseWatchedRecs`. Joins the
 * recommendation row with the recommended media (and the localized en-US
 * fallback) to feed the Watch Next "because you watched X" feed.
 */
export interface BecauseWatchedRec {
  sourceMediaId: string;
  mediaId: string;
  externalId: number;
  provider: string;
  type: "movie" | "show";
  title: string;
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
}
