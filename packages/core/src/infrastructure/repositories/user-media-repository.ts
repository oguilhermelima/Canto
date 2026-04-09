import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  episode,
  list,
  listItem,
  media,
  season,
  userMediaState,
  userPlaybackProgress,
  userWatchHistory,
} from "@canto/db/schema";

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

export async function findUserWatchHistoryByMedia(
  db: Database,
  userId: string,
  mediaId: string,
) {
  return db.query.userWatchHistory.findMany({
    where: and(
      eq(userWatchHistory.userId, userId),
      eq(userWatchHistory.mediaId, mediaId),
    ),
    orderBy: (t, { desc }) => [desc(t.watchedAt)],
  });
}

export async function deleteUserWatchHistoryByIds(
  db: Database,
  userId: string,
  mediaId: string,
  entryIds: string[],
) {
  if (entryIds.length === 0) return 0;

  const deleted = await db
    .delete(userWatchHistory)
    .where(
      and(
        eq(userWatchHistory.userId, userId),
        eq(userWatchHistory.mediaId, mediaId),
        inArray(userWatchHistory.id, entryIds),
      ),
    )
    .returning({ id: userWatchHistory.id });

  return deleted.length;
}

export interface UserPlaybackProgressFeedRow {
  id: string;
  mediaId: string;
  episodeId: string | null;
  positionSeconds: number;
  isCompleted: boolean;
  lastWatchedAt: Date | null;
  source: string | null;
  mediaType: string;
  title: string;
  posterPath: string | null;
  year: number | null;
  mediaRuntime: number | null;
  externalId: number;
  provider: string;
  episodeNumber: number | null;
  episodeTitle: string | null;
  seasonNumber: number | null;
  episodeRuntime: number | null;
}

export async function findUserPlaybackProgressFeed(
  db: Database,
  userId: string,
): Promise<UserPlaybackProgressFeedRow[]> {
  return db
    .select({
      id: userPlaybackProgress.id,
      mediaId: userPlaybackProgress.mediaId,
      episodeId: userPlaybackProgress.episodeId,
      positionSeconds: userPlaybackProgress.positionSeconds,
      isCompleted: userPlaybackProgress.isCompleted,
      lastWatchedAt: userPlaybackProgress.lastWatchedAt,
      source: userPlaybackProgress.source,
      mediaType: media.type,
      title: media.title,
      posterPath: media.posterPath,
      year: media.year,
      mediaRuntime: media.runtime,
      externalId: media.externalId,
      provider: media.provider,
      episodeNumber: episode.number,
      episodeTitle: episode.title,
      seasonNumber: season.number,
      episodeRuntime: episode.runtime,
    })
    .from(userPlaybackProgress)
    .innerJoin(media, eq(userPlaybackProgress.mediaId, media.id))
    .leftJoin(episode, eq(userPlaybackProgress.episodeId, episode.id))
    .leftJoin(season, eq(episode.seasonId, season.id))
    .where(eq(userPlaybackProgress.userId, userId))
    .orderBy(desc(userPlaybackProgress.lastWatchedAt), desc(userPlaybackProgress.id));
}

export interface UserWatchHistoryFeedRow {
  id: string;
  mediaId: string;
  episodeId: string | null;
  watchedAt: Date;
  source: string | null;
  mediaType: string;
  title: string;
  posterPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  episodeNumber: number | null;
  episodeTitle: string | null;
  seasonNumber: number | null;
}

export async function findUserWatchHistoryFeed(
  db: Database,
  userId: string,
  limit = 100,
): Promise<UserWatchHistoryFeedRow[]> {
  return db
    .select({
      id: userWatchHistory.id,
      mediaId: userWatchHistory.mediaId,
      episodeId: userWatchHistory.episodeId,
      watchedAt: userWatchHistory.watchedAt,
      source: userWatchHistory.source,
      mediaType: media.type,
      title: media.title,
      posterPath: media.posterPath,
      year: media.year,
      externalId: media.externalId,
      provider: media.provider,
      episodeNumber: episode.number,
      episodeTitle: episode.title,
      seasonNumber: season.number,
    })
    .from(userWatchHistory)
    .innerJoin(media, eq(userWatchHistory.mediaId, media.id))
    .leftJoin(episode, eq(userWatchHistory.episodeId, episode.id))
    .leftJoin(season, eq(episode.seasonId, season.id))
    .where(eq(userWatchHistory.userId, userId))
    .orderBy(desc(userWatchHistory.watchedAt), desc(userWatchHistory.id))
    .limit(limit);
}

export interface UserListMediaCandidateRow {
  listId: string;
  listName: string;
  listType: string;
  addedAt: Date;
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
}

export async function findUserListMediaCandidates(
  db: Database,
  userId: string,
): Promise<UserListMediaCandidateRow[]> {
  return db
    .select({
      listId: list.id,
      listName: list.name,
      listType: list.type,
      addedAt: listItem.addedAt,
      mediaId: media.id,
      mediaType: media.type,
      title: media.title,
      posterPath: media.posterPath,
      year: media.year,
      externalId: media.externalId,
      provider: media.provider,
    })
    .from(listItem)
    .innerJoin(list, eq(listItem.listId, list.id))
    .innerJoin(media, eq(listItem.mediaId, media.id))
    .where(
      and(
        eq(list.userId, userId),
        or(eq(list.type, "watchlist"), eq(list.type, "custom")),
      ),
    )
    .orderBy(desc(listItem.addedAt), desc(listItem.id));
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

export interface UserWatchHistoryByMediaRow {
  id: string;
  mediaId: string;
  episodeId: string | null;
  watchedAt: Date;
  source: string | null;
}

export async function findUserWatchHistoryByMediaIds(
  db: Database,
  userId: string,
  mediaIds: string[],
): Promise<UserWatchHistoryByMediaRow[]> {
  if (mediaIds.length === 0) return [];

  return db
    .select({
      id: userWatchHistory.id,
      mediaId: userWatchHistory.mediaId,
      episodeId: userWatchHistory.episodeId,
      watchedAt: userWatchHistory.watchedAt,
      source: userWatchHistory.source,
    })
    .from(userWatchHistory)
    .where(
      and(
        eq(userWatchHistory.userId, userId),
        inArray(userWatchHistory.mediaId, mediaIds),
      ),
    )
    .orderBy(desc(userWatchHistory.watchedAt), desc(userWatchHistory.id));
}

export interface EpisodeByMediaRow {
  mediaId: string;
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
  airDate: string | null;
}

export async function findEpisodesByMediaIds(
  db: Database,
  mediaIds: string[],
): Promise<EpisodeByMediaRow[]> {
  if (mediaIds.length === 0) return [];

  return db
    .select({
      mediaId: season.mediaId,
      episodeId: episode.id,
      seasonNumber: season.number,
      episodeNumber: episode.number,
      episodeTitle: episode.title,
      airDate: episode.airDate,
    })
    .from(episode)
    .innerJoin(season, eq(episode.seasonId, season.id))
    .where(inArray(season.mediaId, mediaIds))
    .orderBy(asc(season.mediaId), asc(season.number), asc(episode.number));
}
