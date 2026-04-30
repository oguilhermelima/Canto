import { sql, gte, desc } from "drizzle-orm";
import { media, mediaLocalization } from "@canto/db/schema";

/** Minimum number of votes required for a media item to be recommended */
export const MIN_VOTE_COUNT = 50;

/** Bayesian average parameters: m=100 prior votes, C=6.5 assumed average */
const PRIOR_VOTES = 100;
const PRIOR_AVERAGE = 6.5;

/**
 * Conditions that filter out low-quality recommendation candidates.
 *
 * After Phase 1C-δ the poster_path lives on `media_localization`. We assert
 * its presence on the en-US row via an EXISTS subquery — it doesn't matter
 * whether the calling query already joined the localization tables; this
 * stays a self-contained predicate.
 */
export function getQualityFilters() {
  return [
    gte(media.voteCount, MIN_VOTE_COUNT),
    sql`EXISTS (
      SELECT 1 FROM ${mediaLocalization}
      WHERE ${mediaLocalization.mediaId} = ${media.id}
        AND ${mediaLocalization.language} = 'en-US'
        AND ${mediaLocalization.posterPath} IS NOT NULL
    )`,
  ] as const;
}

/** Order by weighted score (Bayesian average) descending */
export function getWeightedScoreOrder() {
  return desc(
    sql`(${media.voteCount}::numeric * ${media.voteAverage}::numeric + ${PRIOR_VOTES}::numeric * ${PRIOR_AVERAGE}::numeric) / (${media.voteCount}::numeric + ${PRIOR_VOTES}::numeric)`,
  );
}
