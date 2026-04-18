import { asc, desc, eq, sql } from "drizzle-orm";
import { media } from "@canto/db/schema";
import type { SQL } from "drizzle-orm";
import type { RecsFilters } from "../../../domain/types/recs-filters";

/**
 * Build an array of Drizzle SQL conditions from RecsFilters.
 * Each condition maps to one filter property; callers combine them with `and(...)`.
 */
export function buildRecsFilterConditions(filters: RecsFilters): SQL[] {
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
    conditions.push(sql`${media.title} ILIKE ${pattern}`);
  }
  if (genreIds && genreIds.length > 0) {
    if (genreMode === "and") {
      conditions.push(sql`${media.genreIds}::jsonb @> ${JSON.stringify(genreIds)}::jsonb`);
    } else {
      conditions.push(sql`(${sql.join(genreIds.map((id) => sql`${media.genreIds}::jsonb @> ${JSON.stringify([id])}::jsonb`), sql` OR `)})`);
    }
  }
  if (language) conditions.push(sql`${media.originalLanguage} = ${language}`);
  if (scoreMin != null) conditions.push(sql`${media.voteAverage} >= ${scoreMin}`);
  if (scoreMax != null) conditions.push(sql`${media.voteAverage} <= ${scoreMax}`);
  if (yearMin) conditions.push(sql`${media.releaseDate} >= ${yearMin + "-01-01"}`);
  if (yearMax) conditions.push(sql`${media.releaseDate} <= ${yearMax + "-12-31"}`);
  if (runtimeMin != null) conditions.push(sql`${media.runtime} >= ${runtimeMin}`);
  if (runtimeMax != null) conditions.push(sql`${media.runtime} <= ${runtimeMax}`);
  if (certification) conditions.push(sql`${media.contentRating} = ${certification}`);
  if (status) conditions.push(sql`${media.status} = ${status}`);

  const wpIds = watchProviders ? watchProviders.split(/[,|]/).map(Number) : [];
  if (wpIds.length > 0 && watchRegion) {
    conditions.push(sql`${media.id} IN (
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
export function recsSortOrder(sortBy: string | undefined) {
  switch (sortBy) {
    case "vote_average.desc":
      return desc(media.voteAverage);
    case "vote_average.asc":
      return asc(media.voteAverage);
    case "primary_release_date.desc":
      return desc(media.releaseDate);
    case "primary_release_date.asc":
      return asc(media.releaseDate);
    case "title.asc":
      return asc(media.title);
    case "title.desc":
      return desc(media.title);
    default:
      return null;
  }
}
