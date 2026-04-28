import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media, userMediaState, userPlaybackProgress } from "@canto/db/schema";

export async function findUserMediaState(db: Database, userId: string, mediaId: string) {
  return db.query.userMediaState.findFirst({
    where: and(eq(userMediaState.userId, userId), eq(userMediaState.mediaId, mediaId)),
  });
}

/**
 * Upsert a user_media_state row.
 *
 * `updatedAt` semantics: when the caller provides one (e.g. Trakt sync passing
 * the real remote watched/listed/rated timestamp), we never let the row's
 * stored `updatedAt` move backward — the SET uses GREATEST(stored, incoming).
 * That way independent sync sections that touch the same row (favorited on
 * Trakt at T1, rated at T2 > T1) always converge on the most recent real
 * event time, regardless of which section runs first.
 *
 * When the caller omits `updatedAt`, we fall back to `now()` — that path is
 * for genuine "this just happened locally" writes (manual mark-watched,
 * UI rating). Insert path mirrors the same rule.
 */
export async function upsertUserMediaState(
  db: Database,
  data: typeof userMediaState.$inferInsert,
) {
  const now = new Date();
  const incomingUpdatedAt = data.updatedAt instanceof Date
    ? data.updatedAt
    : data.updatedAt
      ? new Date(data.updatedAt)
      : null;

  const insertValues = {
    ...data,
    updatedAt: incomingUpdatedAt ?? now,
  };

  const setClause = incomingUpdatedAt
    ? {
        ...data,
        updatedAt: sql`GREATEST(${userMediaState.updatedAt}, ${incomingUpdatedAt.toISOString()}::timestamptz)`,
      }
    : { ...data, updatedAt: now };

  const [upserted] = await db
    .insert(userMediaState)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [userMediaState.userId, userMediaState.mediaId],
      set: setClause,
    })
    .returning();
  return upserted;
}

export interface UserMediaStateByMediaRow {
  mediaId: string;
  status: string | null;
  rating: number | null;
  updatedAt: Date;
}

export async function findUserMediaStatesByMediaIds(
  db: Database,
  userId: string,
  mediaIds: string[],
): Promise<UserMediaStateByMediaRow[]> {
  if (mediaIds.length === 0) return [];

  return db
    .select({
      mediaId: userMediaState.mediaId,
      status: userMediaState.status,
      rating: userMediaState.rating,
      updatedAt: userMediaState.updatedAt,
    })
    .from(userMediaState)
    .where(
      and(
        eq(userMediaState.userId, userId),
        inArray(userMediaState.mediaId, mediaIds),
      ),
    );
}

export interface UserEngagementStateRow {
  mediaId: string;
  status: string | null;
  rating: number | null;
  isFavorite: boolean;
  updatedAt: Date;
}

export interface RecentlyCompletedMediaRow {
  mediaId: string;
  title: string;
  posterPath: string | null;
  type: "movie" | "show";
  completedAt: Date;
}

/**
 * Recently completed media. Two signals merged:
 *
 * - `userMediaState.status = 'completed'` — explicit (manual or sync from
 *   Trakt/Plex/Jellyfin marking the show finished)
 * - `userPlaybackProgress.isCompleted = true AND episodeId IS NULL` —
 *   implicit, only meaningful for movies (there is no whole-show playback
 *   progress row).
 *
 * If both fire for the same mediaId, we keep the more recent timestamp.
 * `mediaType` filters the output without affecting the signal source.
 */
export async function findRecentlyCompletedMedia(
  db: Database,
  userId: string,
  mediaType: "movie" | "show" | undefined,
  limit: number,
): Promise<RecentlyCompletedMediaRow[]> {
  const explicit = await db
    .select({
      mediaId: userMediaState.mediaId,
      title: media.title,
      posterPath: media.posterPath,
      type: media.type,
      completedAt: userMediaState.updatedAt,
    })
    .from(userMediaState)
    .innerJoin(media, eq(media.id, userMediaState.mediaId))
    .where(
      and(
        eq(userMediaState.userId, userId),
        eq(userMediaState.status, "completed"),
        mediaType ? eq(media.type, mediaType) : undefined,
      ),
    )
    .orderBy(desc(userMediaState.updatedAt))
    .limit(limit * 2);

  const implicit =
    !mediaType || mediaType === "movie"
      ? await db
          .select({
            mediaId: userPlaybackProgress.mediaId,
            title: media.title,
            posterPath: media.posterPath,
            type: media.type,
            completedAt: userPlaybackProgress.lastWatchedAt,
          })
          .from(userPlaybackProgress)
          .innerJoin(media, eq(media.id, userPlaybackProgress.mediaId))
          .where(
            and(
              eq(userPlaybackProgress.userId, userId),
              eq(userPlaybackProgress.isCompleted, true),
              sql`${userPlaybackProgress.episodeId} IS NULL`,
              sql`${userPlaybackProgress.deletedAt} IS NULL`,
              isNotNull(userPlaybackProgress.lastWatchedAt),
              eq(media.type, "movie"),
            ),
          )
          .orderBy(desc(userPlaybackProgress.lastWatchedAt))
          .limit(limit * 2)
      : [];

  const merged = new Map<string, RecentlyCompletedMediaRow>();
  for (const row of explicit) {
    if (row.type !== "movie" && row.type !== "show") continue;
    merged.set(row.mediaId, {
      mediaId: row.mediaId,
      title: row.title,
      posterPath: row.posterPath,
      type: row.type,
      completedAt: row.completedAt,
    });
  }
  for (const row of implicit) {
    if (row.type !== "movie" && row.type !== "show") continue;
    if (!row.completedAt) continue;
    const existing = merged.get(row.mediaId);
    if (!existing || row.completedAt > existing.completedAt) {
      merged.set(row.mediaId, {
        mediaId: row.mediaId,
        title: row.title,
        posterPath: row.posterPath,
        type: row.type,
        completedAt: row.completedAt,
      });
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, limit);
}

/**
 * All non-neutral states for a user: anything with a status, rating, or
 * favorite flag set. Used by the recs rebuild to weight seeds by engagement
 * and to exclude dropped/disliked items from the output.
 */
export async function findUserEngagementStates(
  db: Database,
  userId: string,
): Promise<UserEngagementStateRow[]> {
  return db
    .select({
      mediaId: userMediaState.mediaId,
      status: userMediaState.status,
      rating: userMediaState.rating,
      isFavorite: userMediaState.isFavorite,
      updatedAt: userMediaState.updatedAt,
    })
    .from(userMediaState)
    .where(
      and(
        eq(userMediaState.userId, userId),
        or(
          sql`${userMediaState.status} IS NOT NULL`,
          sql`${userMediaState.rating} IS NOT NULL`,
          eq(userMediaState.isFavorite, true),
        ),
      ),
    );
}
