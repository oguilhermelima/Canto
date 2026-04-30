import { asc, desc, sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import { userRecommendation } from "@canto/db/schema";
import type { RecsFilters } from "../../domain/recommendations/types/recs-filters";

/**
 * Column refs the filter builder needs. The same filter shape is reused against
 * the de-normalized `user_recommendation` columns and against the canonical
 * `media` table joined with `media_localization` (the title column there is a
 * SQL COALESCE expression — accept it via the `title: AnyColumn | SQL` shape).
 * Passing a struct keeps the builder a single function while letting callers
 * point it at whichever target is in scope for their query.
 */
export interface RecsFilterColumns {
  id: AnyColumn;
  title: AnyColumn | SQL;
  genreIds: AnyColumn;
  originalLanguage: AnyColumn;
  voteAverage: AnyColumn;
  releaseDate: AnyColumn;
  runtime: AnyColumn;
  contentRating: AnyColumn;
  status: AnyColumn;
}

/** Filter conditions read from the de-normalized `user_recommendation` row. */
export const USER_REC_COLUMNS: RecsFilterColumns = {
  id: userRecommendation.mediaId,
  title: userRecommendation.title,
  genreIds: userRecommendation.genreIds,
  originalLanguage: userRecommendation.originalLanguage,
  voteAverage: userRecommendation.voteAverage,
  releaseDate: userRecommendation.releaseDate,
  runtime: userRecommendation.runtime,
  contentRating: userRecommendation.contentRating,
  status: userRecommendation.status,
};

/**
 * Build an array of Drizzle SQL conditions from RecsFilters. Each condition
 * maps to one filter property; callers combine them with `and(...)`.
 *
 * Callers must supply column refs — there is no longer a default because the
 * canonical media titles live on `media_localization` and need a `language`
 * to resolve. Use `mediaI18n(language)` and pass the resolved `title`
 * expression in via `RecsFilterColumns.title`.
 */
export function buildRecsFilterConditions(
  filters: RecsFilters,
  columns: RecsFilterColumns,
): SQL[] {
  const {
    q,
    genreIds,
    genreMode = "or",
    language,
    scoreMin,
    scoreMax,
    yearMin,
    yearMax,
    runtimeMin,
    runtimeMax,
    certification,
    status,
    watchProviders,
    watchRegion,
  } = filters;

  const conditions: SQL[] = [];

  if (q && q.length > 0) {
    const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(sql`${columns.title} ILIKE ${pattern}`);
  }
  if (genreIds && genreIds.length > 0) {
    if (genreMode === "and") {
      conditions.push(sql`${columns.genreIds}::jsonb @> ${JSON.stringify(genreIds)}::jsonb`);
    } else {
      conditions.push(sql`(${sql.join(genreIds.map((id) => sql`${columns.genreIds}::jsonb @> ${JSON.stringify([id])}::jsonb`), sql` OR `)})`);
    }
  }
  if (language) conditions.push(sql`${columns.originalLanguage} = ${language}`);
  if (scoreMin != null) conditions.push(sql`${columns.voteAverage} >= ${scoreMin}`);
  if (scoreMax != null) conditions.push(sql`${columns.voteAverage} <= ${scoreMax}`);
  if (yearMin) conditions.push(sql`${columns.releaseDate} >= ${yearMin + "-01-01"}`);
  if (yearMax) conditions.push(sql`${columns.releaseDate} <= ${yearMax + "-12-31"}`);
  if (runtimeMin != null) conditions.push(sql`${columns.runtime} >= ${runtimeMin}`);
  if (runtimeMax != null) conditions.push(sql`${columns.runtime} <= ${runtimeMax}`);
  if (certification) conditions.push(sql`${columns.contentRating} = ${certification}`);
  if (status) conditions.push(sql`${columns.status} = ${status}`);

  // Watch-providers always live on `media_watch_provider` (a single source of
  // truth for provider availability across the catalog), so the membership
  // check joins via the `id` column from whichever target table is in scope.
  const wpIds = watchProviders ? watchProviders.split(/[,|]/).map(Number) : [];
  if (wpIds.length > 0 && watchRegion) {
    conditions.push(sql`${columns.id} IN (
      SELECT media_id FROM media_watch_provider
      WHERE provider_id IN (${sql.join(wpIds.map(id => sql`${id}`), sql`, `)})
      AND region = ${watchRegion}
    )`);
  }

  return conditions;
}

/**
 * Map a TMDB-style sort string to a Drizzle orderBy expression.
 * Returns `null` when the caller should use its own default ordering.
 */
export function recsSortOrder(
  sortBy: string | undefined,
  columns: RecsFilterColumns,
) {
  switch (sortBy) {
    case "vote_average.desc":
      return desc(columns.voteAverage);
    case "vote_average.asc":
      return asc(columns.voteAverage);
    case "primary_release_date.desc":
      return desc(columns.releaseDate);
    case "primary_release_date.asc":
      return asc(columns.releaseDate);
    case "title.asc":
      return asc(columns.title);
    case "title.desc":
      return desc(columns.title);
    default:
      return null;
  }
}
