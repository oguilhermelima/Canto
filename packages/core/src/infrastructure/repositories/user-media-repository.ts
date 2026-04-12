import { and, asc, count, desc, eq, gt, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  episode,
  list,
  listItem,
  media,
  mediaVideo,
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
  backdropPath: string | null;
  logoPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  genres: unknown;
  genreIds: unknown;
  trailerKey: string | null;
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
  mediaType?: "movie" | "show",
): Promise<UserPlaybackProgressFeedRow[]> {
  const conditions = [
    eq(userPlaybackProgress.userId, userId),
    isNull(userPlaybackProgress.deletedAt),
  ];
  if (mediaType) conditions.push(eq(media.type, mediaType));

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
      backdropPath: media.backdropPath,
      logoPath: media.logoPath,
      overview: media.overview,
      voteAverage: media.voteAverage,
      genres: media.genres,
      genreIds: media.genreIds,
      trailerKey: sql<string | null>`(SELECT ${mediaVideo.externalKey} FROM ${mediaVideo} WHERE ${mediaVideo.mediaId} = ${media.id} AND ${mediaVideo.type} = 'Trailer' AND ${mediaVideo.site} = 'YouTube' LIMIT 1)`,
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
    .where(and(...conditions))
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
  mediaType?: "movie" | "show",
): Promise<UserWatchHistoryFeedRow[]> {
  const conditions = [
    eq(userWatchHistory.userId, userId),
    isNull(userWatchHistory.deletedAt),
  ];
  if (mediaType) conditions.push(eq(media.type, mediaType));

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
    .where(and(...conditions))
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
  backdropPath: string | null;
  year: number | null;
  releaseDate: string | null;
  externalId: number;
  provider: string;
}

export async function findUserListMediaCandidates(
  db: Database,
  userId: string,
  mediaType?: "movie" | "show",
): Promise<UserListMediaCandidateRow[]> {
  const conditions = [
    eq(list.userId, userId),
    or(eq(list.type, "watchlist"), eq(list.type, "custom")),
  ];
  if (mediaType) conditions.push(eq(media.type, mediaType));

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
      backdropPath: media.backdropPath,
      year: media.year,
      releaseDate: media.releaseDate,
      externalId: media.externalId,
      provider: media.provider,
    })
    .from(listItem)
    .innerJoin(list, eq(listItem.listId, list.id))
    .innerJoin(media, eq(listItem.mediaId, media.id))
    .where(and(...conditions))
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
        isNull(userWatchHistory.deletedAt),
      ),
    )
    .orderBy(desc(userWatchHistory.watchedAt), desc(userWatchHistory.id));
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

/* -------------------------------------------------------------------------- */
/*  User Library Stats                                                        */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  User Media Paginated (profile tabs)                                       */
/* -------------------------------------------------------------------------- */

export interface UserMediaPaginatedRow {
  mediaId: string;
  status: string | null;
  rating: number | null;
  isFavorite: boolean;
  stateUpdatedAt: Date;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  genres: unknown;
  genreIds: unknown;
  trailerKey: string | null;
  year: number | null;
  externalId: number;
  provider: string;
}

export async function findUserMediaPaginated(
  db: Database,
  userId: string,
  opts: {
    status?: string;
    hasRating?: boolean;
    isFavorite?: boolean;
    mediaType?: "movie" | "show";
    sortBy?: "updatedAt" | "rating" | "title" | "year";
    sortOrder?: "asc" | "desc";
    limit: number;
    offset: number;
  },
): Promise<{ items: UserMediaPaginatedRow[]; total: number }> {
  const conditions: SQL[] = [eq(userMediaState.userId, userId)];

  if (opts.status) {
    conditions.push(eq(userMediaState.status, opts.status));
  }
  if (opts.hasRating) {
    conditions.push(gt(userMediaState.rating, 0));
  }
  if (opts.isFavorite) {
    conditions.push(eq(userMediaState.isFavorite, true));
  }
  if (opts.mediaType) {
    conditions.push(eq(media.type, opts.mediaType));
  }

  const where = and(...conditions);

  const sortDir = opts.sortOrder === "asc" ? asc : desc;
  const sortColumn = (() => {
    switch (opts.sortBy) {
      case "rating": return userMediaState.rating;
      case "title": return media.title;
      case "year": return media.year;
      default: return userMediaState.updatedAt;
    }
  })();

  const selectFields = {
    mediaId: userMediaState.mediaId,
    status: userMediaState.status,
    rating: userMediaState.rating,
    isFavorite: userMediaState.isFavorite,
    stateUpdatedAt: userMediaState.updatedAt,
    mediaType: media.type,
    title: media.title,
    posterPath: media.posterPath,
    backdropPath: media.backdropPath,
    logoPath: media.logoPath,
    overview: media.overview,
    voteAverage: media.voteAverage,
    genres: media.genres,
    genreIds: media.genreIds,
    trailerKey: sql<string | null>`(SELECT ${mediaVideo.externalKey} FROM ${mediaVideo} WHERE ${mediaVideo.mediaId} = ${media.id} AND ${mediaVideo.type} = 'Trailer' AND ${mediaVideo.site} = 'YouTube' LIMIT 1)`,
    year: media.year,
    externalId: media.externalId,
    provider: media.provider,
  };

  const [items, [countRow]] = await Promise.all([
    db
      .select(selectFields)
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(where)
      .orderBy(sortDir(sortColumn), desc(userMediaState.updatedAt))
      .limit(opts.limit)
      .offset(opts.offset),
    db
      .select({ total: count() })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(where),
  ]);

  return { items, total: countRow?.total ?? 0 };
}

/* -------------------------------------------------------------------------- */
/*  User Media Counts (profile tab badges)                                    */
/* -------------------------------------------------------------------------- */

export interface UserMediaCounts {
  planned: number;
  watching: number;
  completed: number;
  dropped: number;
  favorites: number;
  rated: number;
}

export async function findUserMediaCounts(
  db: Database,
  userId: string,
): Promise<UserMediaCounts> {
  const base = eq(userMediaState.userId, userId);

  const [
    [plannedRow],
    [watchingRow],
    [completedRow],
    [droppedRow],
    [favoritesRow],
    [ratedRow],
  ] = await Promise.all([
    db.select({ total: count() }).from(userMediaState).where(and(base, eq(userMediaState.status, "planned"))),
    db.select({ total: count() }).from(userMediaState).where(and(base, eq(userMediaState.status, "watching"))),
    db.select({ total: count() }).from(userMediaState).where(and(base, eq(userMediaState.status, "completed"))),
    db.select({ total: count() }).from(userMediaState).where(and(base, eq(userMediaState.status, "dropped"))),
    db.select({ total: count() }).from(userMediaState).where(and(base, eq(userMediaState.isFavorite, true))),
    db.select({ total: count() }).from(userMediaState).where(and(base, gt(userMediaState.rating, 0))),
  ]);

  return {
    planned: plannedRow?.total ?? 0,
    watching: watchingRow?.total ?? 0,
    completed: completedRow?.total ?? 0,
    dropped: droppedRow?.total ?? 0,
    favorites: favoritesRow?.total ?? 0,
    rated: ratedRow?.total ?? 0,
  };
}
