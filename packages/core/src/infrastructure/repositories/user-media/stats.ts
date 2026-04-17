import { and, count, desc, eq, gt, gte, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media, userMediaState } from "@canto/db/schema";

export interface UserLibraryStats {
  totalWatched: number;
  moviesWatched: number;
  showsWatched: number;
  watchedThisMonth: number;
  currentlyWatching: number;
}

export async function findUserLibraryStats(
  db: Database,
  userId: string,
): Promise<UserLibraryStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const completedCondition = and(
    eq(userMediaState.userId, userId),
    eq(userMediaState.status, "completed"),
  );

  const [
    [totalRow],
    [moviesRow],
    [showsRow],
    [monthRow],
    [watchingRow],
  ] = await Promise.all([
    db
      .select({ total: count() })
      .from(userMediaState)
      .where(completedCondition),
    db
      .select({ total: count() })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(completedCondition, eq(media.type, "movie"))),
    db
      .select({ total: count() })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(completedCondition, eq(media.type, "show"))),
    db
      .select({ total: count() })
      .from(userMediaState)
      .where(
        and(
          eq(userMediaState.userId, userId),
          eq(userMediaState.status, "completed"),
          gte(userMediaState.updatedAt, monthStart),
        ),
      ),
    db
      .select({ total: count() })
      .from(userMediaState)
      .where(
        and(eq(userMediaState.userId, userId), eq(userMediaState.status, "watching")),
      ),
  ]);

  return {
    totalWatched: totalRow?.total ?? 0,
    moviesWatched: moviesRow?.total ?? 0,
    showsWatched: showsRow?.total ?? 0,
    watchedThisMonth: monthRow?.total ?? 0,
    currentlyWatching: watchingRow?.total ?? 0,
  };
}

export interface UserWatchTimeStats {
  totalMinutes: number;
  movieMinutes: number;
  showMinutes: number;
  movieCount: number;
  showCount: number;
  averageRating: number | null;
  completedThisYear: number;
  recentBackdrop: string | null;
  recentTitle: string | null;
}

export async function findUserWatchTimeStats(
  db: Database,
  userId: string,
): Promise<UserWatchTimeStats> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const completedCondition = and(
    eq(userMediaState.userId, userId),
    eq(userMediaState.status, "completed"),
  );

  const [
    [movieRow],
    [showRow],
    [ratingRow],
    [yearRow],
    recentRows,
  ] = await Promise.all([
    db
      .select({
        minutes: sql<number>`coalesce(sum(${media.runtime}), 0)`,
        count: count(),
      })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(completedCondition, eq(media.type, "movie"))),
    db
      .select({
        minutes: sql<number>`coalesce(sum(${media.runtime}), 0)`,
        count: count(),
      })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(completedCondition, eq(media.type, "show"))),
    db
      .select({
        avg: sql<number | null>`avg(${userMediaState.rating})`,
      })
      .from(userMediaState)
      .where(and(eq(userMediaState.userId, userId), gt(userMediaState.rating, 0))),
    db
      .select({ count: count() })
      .from(userMediaState)
      .where(
        and(completedCondition, gte(userMediaState.updatedAt, yearStart)),
      ),
    // Most recent backdrop for visual hero
    db
      .select({ backdropPath: media.backdropPath, title: media.title })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(
        eq(userMediaState.userId, userId),
        sql`${userMediaState.status} != 'none'`,
        sql`${media.backdropPath} is not null`,
      ))
      .orderBy(desc(userMediaState.updatedAt))
      .limit(1),
  ]);

  const movieMinutes = Number(movieRow?.minutes ?? 0);
  const showMinutes = Number(showRow?.minutes ?? 0);

  return {
    totalMinutes: movieMinutes + showMinutes,
    movieMinutes,
    showMinutes,
    movieCount: movieRow?.count ?? 0,
    showCount: showRow?.count ?? 0,
    averageRating: ratingRow?.avg ? Number(ratingRow.avg) : null,
    completedThisYear: yearRow?.count ?? 0,
    recentBackdrop: recentRows[0]?.backdropPath ?? null,
    recentTitle: recentRows[0]?.title ?? null,
  };
}
