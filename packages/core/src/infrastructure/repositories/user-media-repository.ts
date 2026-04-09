import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userMediaState, userPlaybackProgress, userWatchHistory } from "@canto/db/schema";

/* -------------------------------------------------------------------------- */
/*  User Media State                                                          */
/* -------------------------------------------------------------------------- */

export async function findUserMediaState(db: Database, userId: string, mediaId: string) {
  return db.query.userMediaState.findFirst({
    where: and(eq(userMediaState.userId, userId), eq(userMediaState.mediaId, mediaId)),
  });
}

export async function upsertUserMediaState(
  db: Database,
  data: typeof userMediaState.$inferInsert,
) {
  const [upserted] = await db
    .insert(userMediaState)
    .values(data)
    .onConflictDoUpdate({
      target: [userMediaState.userId, userMediaState.mediaId],
      set: { ...data, updatedAt: new Date() },
    })
    .returning();
  return upserted;
}

/* -------------------------------------------------------------------------- */
/*  Playback Progress                                                         */
/* -------------------------------------------------------------------------- */

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
    ),
  });
}

export async function upsertUserPlaybackProgress(
  db: Database,
  data: typeof userPlaybackProgress.$inferInsert,
) {
  // PostgreSQL unique indexes treat NULL as distinct, so ON CONFLICT won't fire
  // for rows where episodeId IS NULL (movies). We do a find-then-update instead.
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

/* -------------------------------------------------------------------------- */
/*  Watch History                                                             */
/* -------------------------------------------------------------------------- */

export async function addUserWatchHistory(
  db: Database,
  data: typeof userWatchHistory.$inferInsert,
) {
  const [inserted] = await db
    .insert(userWatchHistory)
    .values(data)
    .returning();
  return inserted;
}

export async function findUserWatchHistory(
  db: Database,
  userId: string,
  mediaId: string,
  episodeId: string | null = null,
) {
  return db.query.userWatchHistory.findMany({
    where: and(
      eq(userWatchHistory.userId, userId),
      eq(userWatchHistory.mediaId, mediaId),
      episodeId ? eq(userWatchHistory.episodeId, episodeId) : isNull(userWatchHistory.episodeId),
    ),
    orderBy: (t, { desc }) => [desc(t.watchedAt)],
  });
}
