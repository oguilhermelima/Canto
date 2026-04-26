import { and, desc, eq, sql, count } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  user,
  mediaRecommendation,
  mediaTranslation,
  mediaVideo,
  userRecommendation,
} from "@canto/db/schema";
import type { RecsFilters } from "../../domain/recommendations/types/recs-filters";
import {
  buildRecsFilterConditions,
  recsSortOrder,
  USER_REC_COLUMNS,
} from "./recs-filter-builder";

/**
 * Row shape carried through `rebuildUserRecommendations` /
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
 * Read shape returned by `findUserRecommendations` / `findUserSpotlightItems`.
 * The fields we *guarantee* by the WHERE clause (`title IS NOT NULL` implies
 * the row was populated by the denormalizing rebuild) are narrowed to
 * non-null here so callers don't have to re-check.
 */
export interface UserRecommendationReadRow {
  id: string;
  externalId: number;
  provider: string;
  mediaType: "movie" | "show";
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

/** Keep only the highest weight per mediaId, preserving denormalized fields. */
function bestRowByMedia(rows: UserRecommendationRow[]): Map<string, UserRecommendationRow> {
  const best = new Map<string, UserRecommendationRow>();
  for (const r of rows) {
    const existing = best.get(r.mediaId);
    if (existing === undefined || r.weight > existing.weight) {
      best.set(r.mediaId, r);
    }
  }
  return best;
}

/**
 * Shadow-swap rebuild: inserts new set as inactive, then atomically swaps.
 * The frontend always sees `active = true` rows — zero downtime.
 *
 * 1. Insert new rows with (version = next, active = false)
 * 2. In one transaction: activate new rows + delete old rows + bump user version
 */
export async function rebuildUserRecommendations(
  db: Database,
  userId: string,
  rows: UserRecommendationRow[],
): Promise<void> {
  // Get current version
  const userRow = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { recsVersion: true },
  });
  const currentVersion = userRow?.recsVersion ?? 0;
  const nextVersion = currentVersion + 1;

  const deduped = [...bestRowByMedia(rows).values()].map((r) => ({
    userId,
    mediaId: r.mediaId,
    weight: r.weight,
    version: nextVersion,
    active: false,
    externalId: r.externalId,
    provider: r.provider,
    type: r.type,
    title: r.title,
    overview: r.overview,
    posterPath: r.posterPath,
    backdropPath: r.backdropPath,
    logoPath: r.logoPath,
    voteAverage: r.voteAverage,
    year: r.year,
    releaseDate: r.releaseDate,
    genres: r.genres,
    genreIds: r.genreIds,
    runtime: r.runtime,
    originalLanguage: r.originalLanguage,
    contentRating: r.contentRating,
    status: r.status,
    popularity: r.popularity,
  }));

  // Step 1: Insert new rows as inactive (outside transaction for performance)
  for (let i = 0; i < deduped.length; i += 500) {
    await db
      .insert(userRecommendation)
      .values(deduped.slice(i, i + 500))
      .onConflictDoNothing();
  }

  // Step 2: Atomic swap — activate new, delete old, bump version
  await db.transaction(async (tx) => {
    // Re-check version to detect concurrent rebuilds
    const current = await tx.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { recsVersion: true },
    });
    if ((current?.recsVersion ?? 0) !== currentVersion) {
      // Another rebuild already completed — clean up orphaned inactive rows
      await tx.delete(userRecommendation).where(
        and(eq(userRecommendation.userId, userId), eq(userRecommendation.version, nextVersion)),
      );
      return;
    }

    // Activate new set
    await tx
      .update(userRecommendation)
      .set({ active: true })
      .where(
        and(
          eq(userRecommendation.userId, userId),
          eq(userRecommendation.version, nextVersion),
        ),
      );

    // Delete old set
    await tx.delete(userRecommendation).where(
      and(
        eq(userRecommendation.userId, userId),
        eq(userRecommendation.version, currentVersion),
      ),
    );

    // Bump user version + timestamp
    await tx
      .update(user)
      .set({ recsVersion: nextVersion, recsUpdatedAt: new Date() })
      .where(eq(user.id, userId));
  });
}

/**
 * Additive upsert: add media items for a user without deleting existing recs.
 * Used for reactive updates (list add) — keeps existing recs intact.
 * Inserts with current active version so they're immediately visible.
 */
export async function upsertUserRecommendations(
  db: Database,
  userId: string,
  rows: UserRecommendationRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const userRow = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { recsVersion: true },
  });
  const currentVersion = userRow?.recsVersion ?? 0;

  const deduped = [...bestRowByMedia(rows).values()].map((r) => ({
    userId,
    mediaId: r.mediaId,
    weight: r.weight,
    version: currentVersion,
    active: true,
    externalId: r.externalId,
    provider: r.provider,
    type: r.type,
    title: r.title,
    overview: r.overview,
    posterPath: r.posterPath,
    backdropPath: r.backdropPath,
    logoPath: r.logoPath,
    voteAverage: r.voteAverage,
    year: r.year,
    releaseDate: r.releaseDate,
    genres: r.genres,
    genreIds: r.genreIds,
    runtime: r.runtime,
    originalLanguage: r.originalLanguage,
    contentRating: r.contentRating,
    status: r.status,
    popularity: r.popularity,
  }));

  for (let i = 0; i < deduped.length; i += 500) {
    await db
      .insert(userRecommendation)
      .values(deduped.slice(i, i + 500))
      .onConflictDoNothing();
  }
}

// Re-export for consumers that import from this file
export type { RecsFilters } from "../../domain/recommendations/types/recs-filters";

/**
 * Narrow the raw row to `UserRecommendationReadRow`. The query's WHERE clause
 * already guarantees `title IS NOT NULL`, and rebuilds always populate
 * `externalId` / `provider` / `type` together with `title`, so the runtime
 * filter is defensive — TS just doesn't know that.
 */
function narrowReadRow(r: {
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
}): UserRecommendationReadRow | null {
  if (
    r.externalId === null
    || r.provider === null
    || r.mediaType === null
    || r.title === null
  ) {
    return null;
  }
  if (r.mediaType !== "movie" && r.mediaType !== "show") return null;

  return {
    id: r.id,
    externalId: r.externalId,
    provider: r.provider,
    mediaType: r.mediaType,
    title: r.title,
    overview: r.overview,
    posterPath: r.posterPath,
    backdropPath: r.backdropPath,
    logoPath: r.logoPath,
    releaseDate: r.releaseDate,
    voteAverage: r.voteAverage,
    genres: r.genres,
    genreIds: r.genreIds,
    trailerKey: r.trailerKey ?? null,
    relevance: r.relevance,
  };
}

/**
 * Per-user recommendation query.
 *
 * Reads denormalized columns directly off `user_recommendation` — no JOIN with
 * `media` and no GROUP BY/SUM, since the row is already 1-per-(user, media)
 * with the desired weight stored in place.
 *
 * Translation is overlaid via a LEFT JOIN on `media_translation` keyed on the
 * existing `mediaId` FK, so we only pay one extra index lookup per row when a
 * non-English language is set on the user.
 *
 * Rows whose `title` column is null are skipped — they are pre-denormalization
 * artefacts and will self-heal on the next daily rebuild.
 */
export async function findUserRecommendations(
  db: Database,
  userId: string,
  excludeItems: Array<{ externalId: number; provider: string }>,
  limit: number,
  offset: number,
  filters: RecsFilters = {},
  language = "en-US",
): Promise<UserRecommendationReadRow[]> {
  const useTranslations = !!language && !language.startsWith("en");

  // Anti-join exclusion via NOT EXISTS — scales with library size in O(1)
  // index lookups per row, instead of an O(N) chain of OR predicates.
  const excludeClause =
    excludeItems.length > 0
      ? sql`AND NOT EXISTS (
          SELECT 1 FROM media excl
          WHERE excl.id = ${userRecommendation.mediaId}
            AND excl.in_library = true
        )
        AND NOT EXISTS (
          SELECT 1 FROM list_item excl_li
          INNER JOIN list excl_l ON excl_l.id = excl_li.list_id
          WHERE excl_li.media_id = ${userRecommendation.mediaId}
            AND excl_l.user_id = ${userId}
            AND excl_l.deleted_at IS NULL
            AND excl_l.type != 'server'
        )`
      : sql``;

  // Negative-signal exclusion: drop or rating ≤ 3 means the user explicitly
  // disliked the media — never surface it, even if it was a rec at rebuild
  // time and the dislike came after.
  const negativeClause = sql`AND NOT EXISTS (
    SELECT 1 FROM user_media_state ums_neg
    WHERE ums_neg.user_id = ${userId}
      AND ums_neg.media_id = ${userRecommendation.mediaId}
      AND (ums_neg.status = 'dropped' OR (ums_neg.rating IS NOT NULL AND ums_neg.rating <= 3))
  )`;

  const filterConditions = buildRecsFilterConditions(filters, USER_REC_COLUMNS);
  const filterClauses = filterConditions.map((c) => sql`AND ${c}`);

  const customSort = recsSortOrder(filters.sortBy, USER_REC_COLUMNS);

  const baseSelect = {
    id: userRecommendation.mediaId,
    externalId: userRecommendation.externalId,
    provider: userRecommendation.provider,
    mediaType: userRecommendation.type,
    title: userRecommendation.title,
    overview: userRecommendation.overview,
    posterPath: userRecommendation.posterPath,
    backdropPath: userRecommendation.backdropPath,
    logoPath: userRecommendation.logoPath,
    releaseDate: userRecommendation.releaseDate,
    voteAverage: userRecommendation.voteAverage,
    genres: userRecommendation.genres,
    genreIds: userRecommendation.genreIds,
    trailerKey: sql<string | null>`(SELECT ${mediaVideo.externalKey} FROM ${mediaVideo} WHERE ${mediaVideo.mediaId} = ${userRecommendation.mediaId} AND ${mediaVideo.type} = 'Trailer' AND ${mediaVideo.site} = 'YouTube' LIMIT 1)`,
    relevance: userRecommendation.weight,
  };

  const where = sql`${userRecommendation.userId} = ${userId}
    AND ${userRecommendation.active} = true
    AND ${userRecommendation.title} IS NOT NULL
    AND (${userRecommendation.releaseDate} <= CURRENT_DATE OR ${userRecommendation.releaseDate} IS NULL)
    ${excludeClause}
    ${negativeClause}
    ${sql.join(filterClauses, sql` `)}`;

  if (useTranslations) {
    const rows = await db
      .select({
        ...baseSelect,
        translatedTitle: mediaTranslation.title,
        translatedOverview: mediaTranslation.overview,
        translatedPosterPath: mediaTranslation.posterPath,
        translatedLogoPath: mediaTranslation.logoPath,
      })
      .from(userRecommendation)
      .leftJoin(
        mediaTranslation,
        and(
          eq(mediaTranslation.mediaId, userRecommendation.mediaId),
          eq(mediaTranslation.language, language),
        ),
      )
      .where(where)
      .orderBy(customSort ?? desc(userRecommendation.weight))
      .limit(limit)
      .offset(offset);

    const out: UserRecommendationReadRow[] = [];
    for (const r of rows) {
      const translatedOverview =
        r.translatedOverview && r.translatedOverview.trim().length > 0
          ? r.translatedOverview
          : null;
      const narrowed = narrowReadRow({
        id: r.id,
        externalId: r.externalId,
        provider: r.provider,
        mediaType: r.mediaType,
        title:
          r.translatedTitle && r.translatedTitle.trim().length > 0
            ? r.translatedTitle
            : r.title,
        overview: translatedOverview ?? r.overview,
        posterPath: r.translatedPosterPath ?? r.posterPath,
        backdropPath: r.backdropPath,
        logoPath: r.translatedLogoPath ?? r.logoPath,
        releaseDate: r.releaseDate,
        voteAverage: r.voteAverage,
        genres: r.genres,
        genreIds: r.genreIds,
        trailerKey: r.trailerKey,
        relevance: r.relevance,
      });
      if (narrowed) out.push(narrowed);
    }
    return out;
  }

  const rows = await db
    .select(baseSelect)
    .from(userRecommendation)
    .where(where)
    .orderBy(customSort ?? desc(userRecommendation.weight))
    .limit(limit)
    .offset(offset);

  const out: UserRecommendationReadRow[] = [];
  for (const r of rows) {
    const narrowed = narrowReadRow(r);
    if (narrowed) out.push(narrowed);
  }
  return out;
}

/** Count active user_recommendation rows for a user (to decide fallback). */
export async function countUserRecommendations(
  db: Database,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(userRecommendation)
    .where(
      and(
        eq(userRecommendation.userId, userId),
        eq(userRecommendation.active, true),
        sql`${userRecommendation.title} IS NOT NULL`,
      ),
    );
  return row?.count ?? 0;
}

/**
 * Delete active user_recommendation rows linked to media from a specific source.
 * Used when a user removes an item from their list.
 */
export async function deleteUserRecommendationsForSource(
  db: Database,
  userId: string,
  sourceMediaId: string,
): Promise<void> {
  const subquery = db
    .select({ mediaId: mediaRecommendation.mediaId })
    .from(mediaRecommendation)
    .where(eq(mediaRecommendation.sourceMediaId, sourceMediaId));

  await db.delete(userRecommendation).where(
    and(
      eq(userRecommendation.userId, userId),
      eq(userRecommendation.active, true),
      sql`${userRecommendation.mediaId} IN (${subquery})`,
    ),
  );
}

/**
 * Remove a specific media from a user's active recommendations.
 * Used when user adds the media to a list (it should no longer appear as a recommendation).
 */
export async function removeMediaFromUserRecs(
  db: Database,
  userId: string,
  mediaId: string,
): Promise<void> {
  await db.delete(userRecommendation).where(
    and(
      eq(userRecommendation.userId, userId),
      eq(userRecommendation.mediaId, mediaId),
      eq(userRecommendation.active, true),
    ),
  );
}

/** Find users whose recs are stale (null or >24h). Used by daily safety-net job. */
export async function findUsersForDailyRecsCheck(
  db: Database,
): Promise<Array<{ id: string }>> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString();

  return db
    .select({ id: user.id })
    .from(user)
    .where(
      sql`${user.recsUpdatedAt} IS NULL OR ${user.recsUpdatedAt} < ${twentyFourHoursAgo}::timestamptz`,
    );
}

/**
 * Per-user spotlight: top-weighted active items from user_recommendation
 * that have a backdrop. Reads denormalized columns directly — no JOIN with
 * `media`, no GROUP BY/SUM. Translation overlay matches `findUserRecommendations`.
 */
export async function findUserSpotlightItems(
  db: Database,
  userId: string,
  excludeItems: Array<{ externalId: number; provider: string }>,
  limit: number,
  language = "en-US",
): Promise<UserRecommendationReadRow[]> {
  const useTranslations = !!language && !language.startsWith("en");

  // Anti-join exclusion via NOT EXISTS — scales with library size in O(1)
  // index lookups per row, instead of an O(N) chain of OR predicates.
  const excludeClause =
    excludeItems.length > 0
      ? sql`AND NOT EXISTS (
          SELECT 1 FROM media excl
          WHERE excl.id = ${userRecommendation.mediaId}
            AND excl.in_library = true
        )
        AND NOT EXISTS (
          SELECT 1 FROM list_item excl_li
          INNER JOIN list excl_l ON excl_l.id = excl_li.list_id
          WHERE excl_li.media_id = ${userRecommendation.mediaId}
            AND excl_l.user_id = ${userId}
            AND excl_l.deleted_at IS NULL
            AND excl_l.type != 'server'
        )`
      : sql``;

  // Negative-signal exclusion: drop or rating ≤ 3 means the user explicitly
  // disliked the media — never surface it in spotlight either.
  const negativeClause = sql`AND NOT EXISTS (
    SELECT 1 FROM user_media_state ums_neg
    WHERE ums_neg.user_id = ${userId}
      AND ums_neg.media_id = ${userRecommendation.mediaId}
      AND (ums_neg.status = 'dropped' OR (ums_neg.rating IS NOT NULL AND ums_neg.rating <= 3))
  )`;

  const baseSelect = {
    id: userRecommendation.mediaId,
    externalId: userRecommendation.externalId,
    provider: userRecommendation.provider,
    mediaType: userRecommendation.type,
    title: userRecommendation.title,
    overview: userRecommendation.overview,
    posterPath: userRecommendation.posterPath,
    backdropPath: userRecommendation.backdropPath,
    logoPath: userRecommendation.logoPath,
    releaseDate: userRecommendation.releaseDate,
    voteAverage: userRecommendation.voteAverage,
    genres: userRecommendation.genres,
    genreIds: userRecommendation.genreIds,
    relevance: userRecommendation.weight,
  };

  const where = sql`${userRecommendation.userId} = ${userId}
    AND ${userRecommendation.active} = true
    AND ${userRecommendation.title} IS NOT NULL
    AND ${userRecommendation.backdropPath} IS NOT NULL
    AND (${userRecommendation.releaseDate} <= CURRENT_DATE OR ${userRecommendation.releaseDate} IS NULL)
    ${excludeClause}
    ${negativeClause}`;

  if (useTranslations) {
    const rows = await db
      .select({
        ...baseSelect,
        translatedTitle: mediaTranslation.title,
        translatedOverview: mediaTranslation.overview,
        translatedPosterPath: mediaTranslation.posterPath,
        translatedLogoPath: mediaTranslation.logoPath,
      })
      .from(userRecommendation)
      .leftJoin(
        mediaTranslation,
        and(
          eq(mediaTranslation.mediaId, userRecommendation.mediaId),
          eq(mediaTranslation.language, language),
        ),
      )
      .where(where)
      .orderBy(desc(userRecommendation.weight))
      .limit(limit);

    const out: UserRecommendationReadRow[] = [];
    for (const r of rows) {
      const translatedOverview =
        r.translatedOverview && r.translatedOverview.trim().length > 0
          ? r.translatedOverview
          : null;
      const narrowed = narrowReadRow({
        id: r.id,
        externalId: r.externalId,
        provider: r.provider,
        mediaType: r.mediaType,
        title:
          r.translatedTitle && r.translatedTitle.trim().length > 0
            ? r.translatedTitle
            : r.title,
        overview: translatedOverview ?? r.overview,
        posterPath: r.translatedPosterPath ?? r.posterPath,
        backdropPath: r.backdropPath,
        logoPath: r.translatedLogoPath ?? r.logoPath,
        releaseDate: r.releaseDate,
        voteAverage: r.voteAverage,
        genres: r.genres,
        genreIds: r.genreIds,
        relevance: r.relevance,
      });
      if (narrowed) out.push(narrowed);
    }
    return out;
  }

  const rows = await db
    .select(baseSelect)
    .from(userRecommendation)
    .where(where)
    .orderBy(desc(userRecommendation.weight))
    .limit(limit);

  const out: UserRecommendationReadRow[] = [];
  for (const r of rows) {
    const narrowed = narrowReadRow(r);
    if (narrowed) out.push(narrowed);
  }
  return out;
}
