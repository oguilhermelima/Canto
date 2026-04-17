import { and, desc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media, userPlaybackProgress } from "@canto/db/schema";

export async function findUserPlaybackProgress(
  db: Database,
  userId: string,
  mediaId: string,
  episodeId: string | null = null,
) {
  return db.query.userPlaybackProgress.findFirst({
    where: and(
      eq(userPlaybackProgress.userId, userId),
      eq(userPlaybackProgress.mediaId, mediaId),
      episodeId ? eq(userPlaybackProgress.episodeId, episodeId) : isNull(userPlaybackProgress.episodeId),
      isNull(userPlaybackProgress.deletedAt),
    ),
  });
}

export async function findUserPlaybackProgressByMedia(
  db: Database,
  userId: string,
  mediaId: string,
) {
  return db.query.userPlaybackProgress.findMany({
    where: and(
      eq(userPlaybackProgress.userId, userId),
      eq(userPlaybackProgress.mediaId, mediaId),
      isNull(userPlaybackProgress.deletedAt),
    ),
    orderBy: (t, { desc }) => [desc(t.lastWatchedAt), desc(t.id)],
  });
}

export async function upsertUserPlaybackProgress(
  db: Database,
  data: typeof userPlaybackProgress.$inferInsert,
) {
  // PostgreSQL unique indexes treat NULL as distinct, so ON CONFLICT won't fire
  // for rows where episodeId IS NULL (movies). We do a find-then-update instead.
  // We include soft-deleted rows in the lookup so the tombstone logic below
  // can decide whether to resurrect them.
  const existing = await db.query.userPlaybackProgress.findFirst({
    where: and(
      eq(userPlaybackProgress.userId, data.userId),
      eq(userPlaybackProgress.mediaId, data.mediaId),
      data.episodeId
        ? eq(userPlaybackProgress.episodeId, data.episodeId)
        : isNull(userPlaybackProgress.episodeId),
    ),
  });

  if (existing) {
    // Tombstone semantics: if the user previously deleted this row, ignore
    // server-sourced echoes that are not strictly newer than the deletion.
    // A genuine new watch (lastWatchedAt > deletedAt) clears the tombstone.
    if (existing.deletedAt) {
      const incomingAt = data.lastWatchedAt instanceof Date
        ? data.lastWatchedAt
        : data.lastWatchedAt
          ? new Date(data.lastWatchedAt)
          : null;
      if (!incomingAt || incomingAt.getTime() <= existing.deletedAt.getTime()) {
        return existing;
      }
      const [revived] = await db
        .update(userPlaybackProgress)
        .set({ ...data, deletedAt: null })
        .where(eq(userPlaybackProgress.id, existing.id))
        .returning();
      return revived;
    }

    const [updated] = await db
      .update(userPlaybackProgress)
      .set(data)
      .where(eq(userPlaybackProgress.id, existing.id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(userPlaybackProgress)
    .values(data)
    .returning();
  return inserted;
}

/** Get all distinct (userId, mediaId) pairs that have any playback progress entries.
 * Used for reconciling user_media_state from existing playback data. */
export async function findDistinctPlaybackMediaPairs(
  db: Database,
  userId?: string,
): Promise<Array<{ userId: string; mediaId: string }>> {
  const rows = await db
    .selectDistinct({
      userId: userPlaybackProgress.userId,
      mediaId: userPlaybackProgress.mediaId,
    })
    .from(userPlaybackProgress)
    .where(
      and(
        userId ? eq(userPlaybackProgress.userId, userId) : undefined,
        isNull(userPlaybackProgress.deletedAt),
      ),
    );
  return rows;
}

/**
 * Soft-delete playback progress rows for a given (userId, mediaId, episodeId)
 * tuple. A NULL in `episodeIds` matches the movie-level row (episodeId IS NULL).
 * The tombstone prevents reverse-sync from resurrecting the row on the next
 * scan when the server still reports the item as watched.
 */
export async function softDeleteUserPlaybackProgress(
  db: Database,
  userId: string,
  mediaId: string,
  episodeIds: (string | null)[],
): Promise<number> {
  if (episodeIds.length === 0) return 0;

  const concreteIds = episodeIds.filter((id): id is string => id !== null);
  const hasMovieLevel = episodeIds.some((id) => id === null);

  const episodeClauses: SQL[] = [];
  if (concreteIds.length > 0) {
    episodeClauses.push(inArray(userPlaybackProgress.episodeId, concreteIds));
  }
  if (hasMovieLevel) {
    episodeClauses.push(isNull(userPlaybackProgress.episodeId));
  }
  if (episodeClauses.length === 0) return 0;

  const deleted = await db
    .update(userPlaybackProgress)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(userPlaybackProgress.userId, userId),
        eq(userPlaybackProgress.mediaId, mediaId),
        isNull(userPlaybackProgress.deletedAt),
        episodeClauses.length === 1 ? episodeClauses[0] : or(...episodeClauses),
      ),
    )
    .returning({ id: userPlaybackProgress.id });

  return deleted.length;
}

export interface CompletedPlaybackEpisodeRow {
  mediaId: string;
  episodeId: string | null;
  isCompleted: boolean;
}

/**
 * Find all completed episodes (and show-level completions) for a user across a set of media.
 * Used to determine "watched" episodes when computing next episode, supplementing watch_history
 * with data synced from Jellyfin/Plex (which writes to playback_progress, not watch_history).
 */
export async function findUserCompletedPlaybackByMediaIds(
  db: Database,
  userId: string,
  mediaIds: string[],
): Promise<CompletedPlaybackEpisodeRow[]> {
  if (mediaIds.length === 0) return [];

  return db
    .select({
      mediaId: userPlaybackProgress.mediaId,
      episodeId: userPlaybackProgress.episodeId,
      isCompleted: userPlaybackProgress.isCompleted,
    })
    .from(userPlaybackProgress)
    .where(
      and(
        eq(userPlaybackProgress.userId, userId),
        inArray(userPlaybackProgress.mediaId, mediaIds),
        eq(userPlaybackProgress.isCompleted, true),
        isNull(userPlaybackProgress.deletedAt),
      ),
    );
}

/**
 * Find all shows (media.type='show') the user has any playback activity for,
 * regardless of whether they're in a list. Used to include actively-watched shows
 * in Watch Next candidates.
 */
export async function findUserWatchingShowsMetadata(
  db: Database,
  userId: string,
): Promise<Array<{
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  lastActivityAt: Date | null;
}>> {
  const rows = await db
    .selectDistinct({
      mediaId: media.id,
      mediaType: media.type,
      title: media.title,
      posterPath: media.posterPath,
      backdropPath: media.backdropPath,
      year: media.year,
      externalId: media.externalId,
      provider: media.provider,
      lastActivityAt: userPlaybackProgress.lastWatchedAt,
    })
    .from(userPlaybackProgress)
    .innerJoin(media, eq(userPlaybackProgress.mediaId, media.id))
    .where(
      and(
        eq(userPlaybackProgress.userId, userId),
        eq(media.type, "show"),
        isNull(userPlaybackProgress.deletedAt),
      ),
    )
    .orderBy(desc(userPlaybackProgress.lastWatchedAt));

  // Dedupe by mediaId (selectDistinct doesn't dedupe on multi-column select)
  const seen = new Set<string>();
  const deduped: typeof rows = [];
  for (const row of rows) {
    if (seen.has(row.mediaId)) continue;
    seen.add(row.mediaId);
    deduped.push(row);
  }
  return deduped;
}
