import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { episode, media, season, user, userMediaState, userRating } from "@canto/db/schema";
import type { UserRatingSyncRow } from "@canto/core/domain/user-media/types/user-rating";

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
    /** Real event time (e.g. Trakt's `rated_at`). When provided, the row's
     *  stored `updatedAt` is moved to GREATEST(stored, incoming) so an
     *  out-of-order sync replay can never pull the timestamp backward.
     *  Defaults to `now()`. The same value is used as `createdAt` on insert. */
    ratedAt?: Date;
  },
): Promise<typeof userRating.$inferSelect> {
  const now = new Date();
  const stamp = data.ratedAt ?? now;
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
        updatedAt: data.ratedAt
          ? sql`GREATEST(${userRating.updatedAt}, ${data.ratedAt.toISOString()}::timestamptz)`
          : now,
      })
      .where(eq(userRating.id, existing.id))
      .returning();
    if (!updated) throw new Error("upsertUserRating: update returned no row");
    return updated;
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
      createdAt: stamp,
      updatedAt: stamp,
    })
    .returning();
  if (!inserted) throw new Error("upsertUserRating: insert returned no row");
  return inserted;
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
/*  Community ratings                                                         */
/* -------------------------------------------------------------------------- */

export interface CommunityReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  seasonId: string | null;
  episodeId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  user: { id: string; name: string | null; image: string | null };
}

export async function findMediaReviews(
  db: Database,
  mediaId: string,
  opts?: { limit?: number; offset?: number; episodeId?: string; sortBy?: "date" | "rating" },
): Promise<{ reviews: CommunityReview[]; total: number }> {
  const { limit = 50, offset = 0, episodeId: filterEpisodeId, sortBy = "date" } = opts ?? {};

  const conditions = [eq(userRating.mediaId, mediaId)];
  if (filterEpisodeId) {
    conditions.push(eq(userRating.episodeId, filterEpisodeId));
  }
  const where = and(...conditions);

  const orderBy = sortBy === "rating"
    ? [desc(userRating.rating), desc(userRating.createdAt)]
    : [desc(userRating.createdAt)];

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: userRating.id,
        rating: userRating.rating,
        comment: userRating.comment,
        createdAt: userRating.createdAt,
        seasonId: userRating.seasonId,
        episodeId: userRating.episodeId,
        seasonNumber: season.number,
        episodeNumber: episode.number,
        episodeTitle: episode.title,
        userId: user.id,
        userName: user.name,
        userImage: user.image,
      })
      .from(userRating)
      .innerJoin(user, eq(userRating.userId, user.id))
      .leftJoin(season, eq(userRating.seasonId, season.id))
      .leftJoin(episode, eq(userRating.episodeId, episode.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(userRating)
      .where(where),
  ]);

  return {
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      seasonId: r.seasonId,
      episodeId: r.episodeId,
      seasonNumber: r.seasonNumber,
      episodeNumber: r.episodeNumber,
      episodeTitle: r.episodeTitle,
      user: { id: r.userId, name: r.userName, image: r.userImage },
    })),
    total: countRow?.total ?? 0,
  };
}

export async function findReviewById(
  db: Database,
  reviewId: string,
): Promise<CommunityReview | null> {
  const [row] = await db
    .select({
      id: userRating.id,
      rating: userRating.rating,
      comment: userRating.comment,
      createdAt: userRating.createdAt,
      seasonId: userRating.seasonId,
      episodeId: userRating.episodeId,
      seasonNumber: season.number,
      episodeNumber: episode.number,
      episodeTitle: episode.title,
      userId: user.id,
      userName: user.name,
      userImage: user.image,
    })
    .from(userRating)
    .innerJoin(user, eq(userRating.userId, user.id))
    .leftJoin(season, eq(userRating.seasonId, season.id))
    .leftJoin(episode, eq(userRating.episodeId, episode.id))
    .where(eq(userRating.id, reviewId));

  if (!row) return null;
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt,
    seasonId: row.seasonId,
    episodeId: row.episodeId,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    episodeTitle: row.episodeTitle,
    user: { id: row.userId, name: row.userName, image: row.userImage },
  };
}

export async function findEpisodeRatingsFromAllUsers(
  db: Database,
  episodeId: string,
): Promise<Array<{
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; image: string | null };
}>> {
  const rows = await db
    .select({
      id: userRating.id,
      rating: userRating.rating,
      comment: userRating.comment,
      createdAt: userRating.createdAt,
      userId: user.id,
      userName: user.name,
      userImage: user.image,
    })
    .from(userRating)
    .innerJoin(user, eq(userRating.userId, user.id))
    .where(eq(userRating.episodeId, episodeId))
    .orderBy(desc(userRating.createdAt));

  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    user: { id: r.userId, name: r.userName, image: r.userImage },
  }));
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
    // Compute average from episode-level ratings for this season.
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

/**
 * Override (user-set) media-level ratings joined with `media` identifiers —
 * the surface Trakt sync uses to reconcile ratings with the remote. Excludes
 * season- and episode-level ratings since Trakt only models media-level
 * scores.
 */
export async function findUserOverrideRatingsForSync(
  db: Database,
  userId: string,
): Promise<UserRatingSyncRow[]> {
  return db
    .select({
      mediaId: userRating.mediaId,
      rating: userRating.rating,
      updatedAt: userRating.updatedAt,
      type: media.type,
      provider: media.provider,
      externalId: media.externalId,
      imdbId: media.imdbId,
      tvdbId: media.tvdbId,
    })
    .from(userRating)
    .innerJoin(media, eq(userRating.mediaId, media.id))
    .where(
      and(
        eq(userRating.userId, userId),
        isNull(userRating.seasonId),
        isNull(userRating.episodeId),
        eq(userRating.isOverride, true),
      ),
    );
}
