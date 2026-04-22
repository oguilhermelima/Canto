import { sql, gte, isNotNull, desc } from "drizzle-orm";
import { media } from "@canto/db/schema";

/** Minimum number of votes required for a media item to be recommended */
export const MIN_VOTE_COUNT = 50;

/** Bayesian average parameters: m=100 prior votes, C=6.5 assumed average */
const PRIOR_VOTES = 100;
const PRIOR_AVERAGE = 6.5;

/** Conditions that filter out low-quality recommendation candidates */
export function getQualityFilters() {
  return [
    gte(media.voteCount, MIN_VOTE_COUNT),
    isNotNull(media.posterPath),
  ] as const;
}

/** Order by weighted score (Bayesian average) descending */
export function getWeightedScoreOrder() {
  return desc(
    sql`(${media.voteCount}::numeric * ${media.voteAverage}::numeric + ${PRIOR_VOTES}::numeric * ${PRIOR_AVERAGE}::numeric) / (${media.voteCount}::numeric + ${PRIOR_VOTES}::numeric)`,
  );
}
