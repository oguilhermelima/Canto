import { and, desc, eq, sql, count } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  user,
  list,
  listItem,
  media,
  mediaRecommendation,
  mediaVideo,
  userRecommendation,
} from "@canto/db/schema";
import type { RecsFilters } from "../../../domain/types/recs-filters";
import { buildRecsFilterConditions, recsSortOrder } from "../shared/recs-filter-builder";

/** Keep only the highest weight per mediaId. */
function bestWeightByMedia(rows: Array<{ mediaId: string; weight: number }>): Map<string, number> {
  const best = new Map<string, number>();
  for (const r of rows) {
    const existing = best.get(r.mediaId);
    if (existing === undefined || r.weight > existing) {
      best.set(r.mediaId, r.weight);
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
  rows: Array<{ mediaId: string; weight: number }>,
): Promise<void> {
  // Get current version
  const userRow = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { recsVersion: true },
  });
  const currentVersion = userRow?.recsVersion ?? 0;
  const nextVersion = currentVersion + 1;

  const deduped = [...bestWeightByMedia(rows).entries()].map(([mediaId, weight]) => ({
    userId,
    mediaId,
    weight,
    version: nextVersion,
    active: false,
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
  rows: Array<{ mediaId: string; weight: number }>,
): Promise<void> {
  if (rows.length === 0) return;

  const userRow = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { recsVersion: true },
  });
  const currentVersion = userRow?.recsVersion ?? 0;

  const deduped = [...bestWeightByMedia(rows).entries()].map(([mediaId, weight]) => ({
    userId,
    mediaId,
    weight,
    version: currentVersion,
    active: true,
  }));

  for (let i = 0; i < deduped.length; i += 500) {
    await db
      .insert(userRecommendation)
      .values(deduped.slice(i, i + 500))
      .onConflictDoNothing();
  }
}

// Re-export for consumers that import from this file
export type { RecsFilters } from "../../../domain/types/recs-filters";

/**
 * Per-user recommendation query.
 * Only reads active rows. JOINs with media,
 * groups by media fields to dedup, orders by SUM(weight).
 */
export async function findUserRecommendations(
  db: Database,
  userId: string,
  excludeItems: Array<{ externalId: number; provider: string }>,
  limit: number,
  offset: number,
  filters: RecsFilters = {},
) {
  const excludeClause =
    excludeItems.length > 0
      ? sql`AND NOT (${sql.join(
          excludeItems.map(
            (item) => sql`(${media.externalId} = ${item.externalId} AND ${media.provider} = ${item.provider})`,
          ),
          sql` OR `,
        )})`
      : sql``;

  const filterConditions = buildRecsFilterConditions(filters);
  const filterClauses = filterConditions.map((c) => sql`AND ${c}`);

  const customSort = recsSortOrder(filters.sortBy);

  return db
    .select({
      id: media.id,
      externalId: media.externalId,
      provider: media.provider,
      mediaType: media.type,
      title: media.title,
      overview: media.overview,
      posterPath: media.posterPath,
      backdropPath: media.backdropPath,
      logoPath: media.logoPath,
      releaseDate: media.releaseDate,
      voteAverage: media.voteAverage,
      genres: media.genres,
      genreIds: media.genreIds,
      trailerKey: sql<string | null>`(SELECT ${mediaVideo.externalKey} FROM ${mediaVideo} WHERE ${mediaVideo.mediaId} = ${media.id} AND ${mediaVideo.type} = 'Trailer' AND ${mediaVideo.site} = 'YouTube' LIMIT 1)`,
      relevance: sql<number>`SUM(${userRecommendation.weight})`,
    })
    .from(userRecommendation)
    .innerJoin(
      media,
      eq(media.id, userRecommendation.mediaId),
    )
    .where(
      sql`${userRecommendation.userId} = ${userId}
        AND ${userRecommendation.active} = true
        AND ${media.metadataUpdatedAt} IS NOT NULL
        AND (${media.releaseDate} <= CURRENT_DATE OR ${media.releaseDate} IS NULL)
        ${excludeClause}
        ${sql.join(filterClauses, sql` `)}`,
    )
    .groupBy(
      media.id,
      media.externalId,
      media.provider,
      media.type,
      media.title,
      media.overview,
      media.posterPath,
      media.backdropPath,
      media.logoPath,
      media.releaseDate,
      media.voteAverage,
      media.genres,
      media.genreIds,
    )
    .orderBy(
      customSort ?? desc(sql`SUM(${userRecommendation.weight})`),
    )
    .limit(limit)
    .offset(offset);
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
 * that have a backdrop, grouped/deduped by media fields.
 */
export async function findUserSpotlightItems(
  db: Database,
  userId: string,
  excludeItems: Array<{ externalId: number; provider: string }>,
  limit: number,
) {
  const excludeClause =
    excludeItems.length > 0
      ? sql`AND NOT (${sql.join(
          excludeItems.map(
            (item) => sql`(${media.externalId} = ${item.externalId} AND ${media.provider} = ${item.provider})`,
          ),
          sql` OR `,
        )})`
      : sql``;

  return db
    .select({
      id: media.id,
      externalId: media.externalId,
      provider: media.provider,
      mediaType: media.type,
      title: media.title,
      overview: media.overview,
      posterPath: media.posterPath,
      backdropPath: media.backdropPath,
      logoPath: media.logoPath,
      releaseDate: media.releaseDate,
      voteAverage: media.voteAverage,
      genres: media.genres,
      genreIds: media.genreIds,
      relevance: sql<number>`SUM(${userRecommendation.weight})`,
    })
    .from(userRecommendation)
    .innerJoin(
      media,
      eq(media.id, userRecommendation.mediaId),
    )
    .where(
      sql`${userRecommendation.userId} = ${userId}
        AND ${userRecommendation.active} = true
        AND ${media.backdropPath} IS NOT NULL
        AND ${media.metadataUpdatedAt} IS NOT NULL
        AND (${media.releaseDate} <= CURRENT_DATE OR ${media.releaseDate} IS NULL)
        ${excludeClause}`,
    )
    .groupBy(
      media.id,
      media.externalId,
      media.provider,
      media.type,
      media.title,
      media.overview,
      media.backdropPath,
      media.logoPath,
      media.releaseDate,
      media.voteAverage,
      media.genres,
      media.genreIds,
    )
    .orderBy(
      desc(
        sql`SUM(${userRecommendation.weight})`,
      ),
    )
    .limit(limit);
}
