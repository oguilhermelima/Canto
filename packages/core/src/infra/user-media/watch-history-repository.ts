import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { episode, season, userWatchHistory } from "@canto/db/schema";
import { episodeI18n } from "@canto/core/infra/shared/media-i18n";

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
      isNull(userWatchHistory.deletedAt),
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
      isNull(userWatchHistory.deletedAt),
    ),
    orderBy: (t, { desc }) => [desc(t.watchedAt)],
  });
}

export async function deleteUserWatchHistoryByIds(
  db: Database,
  userId: string,
  mediaId: string,
  entryIds: string[],
): Promise<{ count: number; episodeIds: (string | null)[] }> {
  if (entryIds.length === 0) return { count: 0, episodeIds: [] };

  const deleted = await db
    .update(userWatchHistory)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(userWatchHistory.userId, userId),
        eq(userWatchHistory.mediaId, mediaId),
        inArray(userWatchHistory.id, entryIds),
        isNull(userWatchHistory.deletedAt),
      ),
    )
    .returning({ id: userWatchHistory.id, episodeId: userWatchHistory.episodeId });

  return {
    count: deleted.length,
    episodeIds: [...new Set(deleted.map((r) => r.episodeId))],
  };
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
        isNull(userWatchHistory.deletedAt),
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
  language: string,
): Promise<EpisodeByMediaRow[]> {
  if (mediaIds.length === 0) return [];

  const i18n = episodeI18n(language);
  return db
    .select({
      mediaId: season.mediaId,
      episodeId: episode.id,
      seasonNumber: season.number,
      episodeNumber: episode.number,
      episodeTitle: i18n.title,
      airDate: episode.airDate,
    })
    .from(episode)
    .innerJoin(season, eq(episode.seasonId, season.id))
    .leftJoin(i18n.locUser, i18n.locUserJoin)
    .leftJoin(i18n.locEn, i18n.locEnJoin)
    .where(inArray(season.mediaId, mediaIds))
    .orderBy(asc(season.mediaId), asc(season.number), asc(episode.number));
}
