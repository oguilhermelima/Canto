import { and, avg, eq, isNull } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userMediaState, userRating } from "@canto/db/schema";

/* -------------------------------------------------------------------------- */
/*  CRUD                                                                      */
/* -------------------------------------------------------------------------- */

export async function upsertUserRating(
  db: Database,
  data: {
    userId: string;
    mediaId: string;
    seasonId?: string | null;
    episodeId?: string | null;
    rating: number;
    comment?: string | null;
    isOverride?: boolean;
  },
): Promise<typeof userRating.$inferSelect> {
  const existing = await db.query.userRating.findFirst({
    where: and(
      eq(userRating.userId, data.userId),
      eq(userRating.mediaId, data.mediaId),
      data.seasonId
        ? eq(userRating.seasonId, data.seasonId)
        : isNull(userRating.seasonId),
      data.episodeId
        ? eq(userRating.episodeId, data.episodeId)
        : isNull(userRating.episodeId),
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(userRating)
      .set({
        rating: data.rating,
        comment: data.comment ?? existing.comment,
        isOverride: data.isOverride ?? true,
        updatedAt: new Date(),
      })
      .where(eq(userRating.id, existing.id))
      .returning();
    return updated!;
  }

  const [inserted] = await db
    .insert(userRating)
    .values({
      userId: data.userId,
      mediaId: data.mediaId,
      seasonId: data.seasonId ?? null,
      episodeId: data.episodeId ?? null,
      rating: data.rating,
      comment: data.comment ?? null,
      isOverride: data.isOverride ?? true,
    })
    .returning();
  return inserted!;
}

export async function findUserRating(
  db: Database,
  userId: string,
  mediaId: string,
  seasonId?: string | null,
  episodeId?: string | null,
): Promise<typeof userRating.$inferSelect | undefined> {
  return db.query.userRating.findFirst({
    where: and(
      eq(userRating.userId, userId),
      eq(userRating.mediaId, mediaId),
      seasonId ? eq(userRating.seasonId, seasonId) : isNull(userRating.seasonId),
      episodeId ? eq(userRating.episodeId, episodeId) : isNull(userRating.episodeId),
    ),
  });
}

export async function findUserRatingsByMedia(
  db: Database,
  userId: string,
  mediaId: string,
): Promise<Array<typeof userRating.$inferSelect>> {
  return db.query.userRating.findMany({
    where: and(
      eq(userRating.userId, userId),
      eq(userRating.mediaId, mediaId),
    ),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
}

export async function deleteUserRating(
  db: Database,
  userId: string,
  mediaId: string,
  seasonId?: string | null,
  episodeId?: string | null,
): Promise<void> {
  await db
    .delete(userRating)
    .where(
      and(
        eq(userRating.userId, userId),
        eq(userRating.mediaId, mediaId),
        seasonId ? eq(userRating.seasonId, seasonId) : isNull(userRating.seasonId),
        episodeId ? eq(userRating.episodeId, episodeId) : isNull(userRating.episodeId),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/*  Cascade computation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Compute season average from episode ratings, then cascade upward.
 * Skips if a user-overridden season rating exists.
 */
export async function computeAndSyncSeasonRating(
  db: Database,
  userId: string,
  mediaId: string,
  seasonId: string,
): Promise<void> {
  // Check if user has an override at season level
  const seasonOverride = await db.query.userRating.findFirst({
    where: and(
      eq(userRating.userId, userId),
      eq(userRating.mediaId, mediaId),
      eq(userRating.seasonId, seasonId),
      isNull(userRating.episodeId),
      eq(userRating.isOverride, true),
    ),
  });

  if (!seasonOverride) {
    // Compute average from episode ratings for this season
    const [result] = await db
      .select({ avg: avg(userRating.rating) })
      .from(userRating)
      .where(
        and(
          eq(userRating.userId, userId),
          eq(userRating.mediaId, mediaId),
          eq(userRating.seasonId, seasonId),
          // episode-level ratings only (episodeId IS NOT NULL)
          // We can't use isNotNull here, so we filter by having episodeId set
        ),
      );

    // Filter to only episode-level rows by checking episodeId is not null
    const episodeRatings = await db.query.userRating.findMany({
      where: and(
        eq(userRating.userId, userId),
        eq(userRating.mediaId, mediaId),
        eq(userRating.seasonId, seasonId),
      ),
    });
    const episodeOnly = episodeRatings.filter((r) => r.episodeId !== null);

    if (episodeOnly.length > 0) {
      const sum = episodeOnly.reduce((acc, r) => acc + r.rating, 0);
      const computed = Math.round(sum / episodeOnly.length);

      await upsertUserRating(db, {
        userId,
        mediaId,
        seasonId,
        episodeId: null,
        rating: computed,
        isOverride: false,
      });
    }
  }

  // Cascade upward
  await computeAndSyncMediaRating(db, userId, mediaId);
}

/**
 * Compute media average from season ratings (or episode ratings if no seasons),
 * then sync to userMediaState.rating.
 * Skips if a user-overridden media rating exists.
 */
export async function computeAndSyncMediaRating(
  db: Database,
  userId: string,
  mediaId: string,
): Promise<void> {
  // Check if user has an override at media level
  const mediaOverride = await db.query.userRating.findFirst({
    where: and(
      eq(userRating.userId, userId),
      eq(userRating.mediaId, mediaId),
      isNull(userRating.seasonId),
      isNull(userRating.episodeId),
      eq(userRating.isOverride, true),
    ),
  });

  if (mediaOverride) {
    // User has explicit media rating — just sync it
    await syncMediaRatingToState(db, userId, mediaId, mediaOverride.rating);
    return;
  }

  // Try to compute from season-level ratings first
  const allRatings = await db.query.userRating.findMany({
    where: and(
      eq(userRating.userId, userId),
      eq(userRating.mediaId, mediaId),
    ),
  });

  const seasonRatings = allRatings.filter(
    (r) => r.seasonId !== null && r.episodeId === null,
  );

  let computedRating: number | null = null;

  if (seasonRatings.length > 0) {
    const sum = seasonRatings.reduce((acc, r) => acc + r.rating, 0);
    computedRating = Math.round(sum / seasonRatings.length);
  } else {
    // No season ratings — try episode-level directly
    const episodeRatings = allRatings.filter((r) => r.episodeId !== null);
    if (episodeRatings.length > 0) {
      const sum = episodeRatings.reduce((acc, r) => acc + r.rating, 0);
      computedRating = Math.round(sum / episodeRatings.length);
    }
  }

  if (computedRating !== null) {
    await upsertUserRating(db, {
      userId,
      mediaId,
      seasonId: null,
      episodeId: null,
      rating: computedRating,
      isOverride: false,
    });
    await syncMediaRatingToState(db, userId, mediaId, computedRating);
  } else {
    // No ratings at all — clear the media rating from state
    await syncMediaRatingToState(db, userId, mediaId, null);
  }
}

async function syncMediaRatingToState(
  db: Database,
  userId: string,
  mediaId: string,
  rating: number | null,
): Promise<void> {
  const existing = await db.query.userMediaState.findFirst({
    where: and(
      eq(userMediaState.userId, userId),
      eq(userMediaState.mediaId, mediaId),
    ),
  });

  if (existing) {
    await db
      .update(userMediaState)
      .set({ rating, updatedAt: new Date() })
      .where(
        and(
          eq(userMediaState.userId, userId),
          eq(userMediaState.mediaId, mediaId),
        ),
      );
  }
}
