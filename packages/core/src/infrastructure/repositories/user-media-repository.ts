import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  episode,
  list,
  listItem,
  media,
  mediaVideo,
  season,
  userHiddenMedia,
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

export interface LibraryFeedFilterOptions {
  source?: "jellyfin" | "plex" | "manual";
  yearMin?: number;
  yearMax?: number;
  genreIds?: number[];
  sortBy?: "recently_watched" | "name_asc" | "name_desc" | "year_desc" | "year_asc";
  scoreMin?: number;
  scoreMax?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  language?: string;
  certification?: string;
  tvStatus?: string;
}

export async function findUserPlaybackProgressFeed(
  db: Database,
  userId: string,
  mediaType?: "movie" | "show",
  filters?: LibraryFeedFilterOptions,
): Promise<UserPlaybackProgressFeedRow[]> {
  const conditions = [
    eq(userPlaybackProgress.userId, userId),
    isNull(userPlaybackProgress.deletedAt),
  ];
  if (mediaType) conditions.push(eq(media.type, mediaType));
  if (filters?.source) conditions.push(eq(userPlaybackProgress.source, filters.source));
  if (filters?.yearMin !== undefined) conditions.push(gte(media.year, filters.yearMin));
  if (filters?.yearMax !== undefined) conditions.push(lte(media.year, filters.yearMax));
  if (filters?.genreIds && filters.genreIds.length > 0) {
    conditions.push(sql`${media.genreIds}::jsonb @> ${JSON.stringify(filters.genreIds)}::jsonb`);
  }
  if (filters?.scoreMin !== undefined) conditions.push(gte(media.voteAverage, filters.scoreMin));
  if (filters?.scoreMax !== undefined) conditions.push(lte(media.voteAverage, filters.scoreMax));
  if (filters?.runtimeMin !== undefined) conditions.push(gte(media.runtime, filters.runtimeMin));
  if (filters?.runtimeMax !== undefined) conditions.push(lte(media.runtime, filters.runtimeMax));
  if (filters?.language) conditions.push(eq(media.originalLanguage, filters.language));
  if (filters?.certification) conditions.push(eq(media.contentRating, filters.certification));
  if (filters?.tvStatus) conditions.push(eq(media.status, filters.tvStatus));

  const orderClauses = (() => {
    switch (filters?.sortBy) {
      case "name_asc": return [asc(media.title), desc(userPlaybackProgress.id)];
      case "name_desc": return [desc(media.title), desc(userPlaybackProgress.id)];
      case "year_asc": return [asc(media.year), desc(userPlaybackProgress.id)];
      case "year_desc": return [desc(media.year), desc(userPlaybackProgress.id)];
      case "recently_watched":
      default:
        return [desc(userPlaybackProgress.lastWatchedAt), desc(userPlaybackProgress.id)];
    }
  })();

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
    .orderBy(...orderClauses);
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
  filters?: LibraryFeedFilterOptions,
): Promise<UserWatchHistoryFeedRow[]> {
  const conditions = [
    eq(userWatchHistory.userId, userId),
    isNull(userWatchHistory.deletedAt),
  ];
  if (mediaType) conditions.push(eq(media.type, mediaType));
  if (filters?.source) conditions.push(eq(userWatchHistory.source, filters.source));
  if (filters?.yearMin !== undefined) conditions.push(gte(media.year, filters.yearMin));
  if (filters?.yearMax !== undefined) conditions.push(lte(media.year, filters.yearMax));
  if (filters?.genreIds && filters.genreIds.length > 0) {
    conditions.push(sql`${media.genreIds}::jsonb @> ${JSON.stringify(filters.genreIds)}::jsonb`);
  }
  if (filters?.scoreMin !== undefined) conditions.push(gte(media.voteAverage, filters.scoreMin));
  if (filters?.scoreMax !== undefined) conditions.push(lte(media.voteAverage, filters.scoreMax));
  if (filters?.runtimeMin !== undefined) conditions.push(gte(media.runtime, filters.runtimeMin));
  if (filters?.runtimeMax !== undefined) conditions.push(lte(media.runtime, filters.runtimeMax));
  if (filters?.language) conditions.push(eq(media.originalLanguage, filters.language));
  if (filters?.certification) conditions.push(eq(media.contentRating, filters.certification));
  if (filters?.tvStatus) conditions.push(eq(media.status, filters.tvStatus));

  const orderClauses = (() => {
    switch (filters?.sortBy) {
      case "name_asc": return [asc(media.title), desc(userWatchHistory.id)];
      case "name_desc": return [desc(media.title), desc(userWatchHistory.id)];
      case "year_asc": return [asc(media.year), desc(userWatchHistory.id)];
      case "year_desc": return [desc(media.year), desc(userWatchHistory.id)];
      case "recently_watched":
      default:
        return [desc(userWatchHistory.watchedAt), desc(userWatchHistory.id)];
    }
  })();

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
    .orderBy(...orderClauses)
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
    isHidden?: boolean;
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
  if (opts.isHidden !== undefined) {
    conditions.push(eq(userMediaState.isHidden, opts.isHidden));
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
  hidden: number;
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
    [hiddenRow],
  ] = await Promise.all([
    db.select({ total: count() }).from(userMediaState).where(and(base, eq(userMediaState.status, "planned"))),
    db.select({ total: count() }).from(userMediaState).where(and(base, eq(userMediaState.status, "watching"))),
    db.select({ total: count() }).from(userMediaState).where(and(base, eq(userMediaState.status, "completed"))),
    db.select({ total: count() }).from(userMediaState).where(and(base, eq(userMediaState.status, "dropped"))),
    db.select({ total: count() }).from(userMediaState).where(and(base, eq(userMediaState.isFavorite, true))),
    db.select({ total: count() }).from(userMediaState).where(and(base, gt(userMediaState.rating, 0))),
    db.select({ total: count() }).from(userHiddenMedia).where(eq(userHiddenMedia.userId, userId)),
  ]);

  return {
    planned: plannedRow?.total ?? 0,
    watching: watchingRow?.total ?? 0,
    completed: completedRow?.total ?? 0,
    dropped: droppedRow?.total ?? 0,
    favorites: favoritesRow?.total ?? 0,
    rated: ratedRow?.total ?? 0,
    hidden: hiddenRow?.total ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Library Genres                                                            */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Profile Aggregation Queries                                               */
/* -------------------------------------------------------------------------- */

export async function findUserRatingDistribution(
  db: Database,
  userId: string,
): Promise<Array<{ rating: number; count: number }>> {
  const rows = await db
    .select({
      rating: userMediaState.rating,
      count: count(),
    })
    .from(userMediaState)
    .where(and(eq(userMediaState.userId, userId), gt(userMediaState.rating, 0)))
    .groupBy(userMediaState.rating)
    .orderBy(asc(userMediaState.rating));

  return rows.map((r) => ({ rating: r.rating!, count: r.count }));
}

export async function findUserTopGenres(
  db: Database,
  userId: string,
  limit = 10,
): Promise<Array<{ genre: string; count: number }>> {
  return db
    .select({
      genre: sql<string>`jsonb_array_elements_text(${media.genres})`,
      count: count(),
    })
    .from(userMediaState)
    .innerJoin(media, eq(userMediaState.mediaId, media.id))
    .where(
      and(
        eq(userMediaState.userId, userId),
        sql`${userMediaState.status} != 'none'`,
      ),
    )
    .groupBy(sql`jsonb_array_elements_text(${media.genres})`)
    .orderBy(desc(count()))
    .limit(limit);
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

export interface UserRecentActivityRow {
  mediaId: string;
  title: string;
  posterPath: string | null;
  mediaType: string;
  status: string | null;
  rating: number | null;
  isFavorite: boolean;
  updatedAt: Date;
}

export async function findUserRecentActivity(
  db: Database,
  userId: string,
  limit = 8,
): Promise<UserRecentActivityRow[]> {
  return db
    .select({
      mediaId: userMediaState.mediaId,
      title: media.title,
      posterPath: media.posterPath,
      mediaType: media.type,
      status: userMediaState.status,
      rating: userMediaState.rating,
      isFavorite: userMediaState.isFavorite,
      updatedAt: userMediaState.updatedAt,
    })
    .from(userMediaState)
    .innerJoin(media, eq(userMediaState.mediaId, media.id))
    .where(
      and(
        eq(userMediaState.userId, userId),
        sql`${userMediaState.status} != 'none'`,
      ),
    )
    .orderBy(desc(userMediaState.updatedAt))
    .limit(limit);
}

/* -------------------------------------------------------------------------- */
/*  Profile Insights (narrative blocks)                                       */
/* -------------------------------------------------------------------------- */

export interface ProfileInsights {
  decadeDistribution: Array<{ decade: string; count: number }>;
  hiddenGem: { title: string; posterPath: string | null; backdropPath: string | null; userRating: number; publicRating: number } | null;
  unpopularOpinion: { title: string; posterPath: string | null; backdropPath: string | null; userRating: number; publicRating: number } | null;
  shortestMovie: { title: string; runtime: number } | null;
  longestMovie: { title: string; runtime: number } | null;
  averageRuntime: number;
  countries: Array<{ country: string; count: number }>;
  languages: Array<{ language: string; count: number }>;
  recentPercent: number;
  oldestTitle: { title: string; year: number } | null;
  perfectScores: number;
  lowestRatedCount: number;
}

export async function findUserProfileInsights(
  db: Database,
  userId: string,
): Promise<ProfileInsights> {
  const active = and(
    eq(userMediaState.userId, userId),
    sql`${userMediaState.status} != 'none'`,
  );
  const completed = and(
    eq(userMediaState.userId, userId),
    eq(userMediaState.status, "completed"),
  );
  const rated = and(
    eq(userMediaState.userId, userId),
    gt(userMediaState.rating, 0),
  );
  const fiveYearsAgo = new Date().getFullYear() - 5;

  const [
    decadeRows,
    hiddenGemRows,
    unpopularRows,
    shortestRows,
    longestRows,
    [avgRow],
    countryRows,
    languageRows,
    [recentRow],
    [totalActiveRow],
    oldestRows,
    [perfectRow],
    [lowestRow],
  ] = await Promise.all([
    // Decade distribution
    db.select({
      decade: sql<string>`(floor(${media.year}::int / 10) * 10)::text`,
      count: count(),
    })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(active, sql`${media.year} is not null`))
      .groupBy(sql`floor(${media.year}::int / 10) * 10`)
      .orderBy(desc(count())),

    // Hidden gem: user rated much higher than public
    db.select({
      title: media.title,
      posterPath: media.posterPath,
      backdropPath: media.backdropPath,
      userRating: userMediaState.rating,
      publicRating: media.voteAverage,
    })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(rated, sql`${media.voteAverage} > 0`))
      .orderBy(sql`${userMediaState.rating} - ${media.voteAverage} desc`)
      .limit(1),

    // Unpopular opinion: user rated much lower than public
    db.select({
      title: media.title,
      posterPath: media.posterPath,
      backdropPath: media.backdropPath,
      userRating: userMediaState.rating,
      publicRating: media.voteAverage,
    })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(rated, sql`${media.voteAverage} > 0`))
      .orderBy(sql`${userMediaState.rating} - ${media.voteAverage} asc`)
      .limit(1),

    // Shortest completed movie
    db.select({ title: media.title, runtime: media.runtime })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(completed, eq(media.type, "movie"), sql`${media.runtime} > 0`))
      .orderBy(asc(media.runtime))
      .limit(1),

    // Longest completed movie
    db.select({ title: media.title, runtime: media.runtime })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(completed, eq(media.type, "movie"), sql`${media.runtime} > 0`))
      .orderBy(desc(media.runtime))
      .limit(1),

    // Average runtime
    db.select({ avg: sql<number>`coalesce(avg(${media.runtime}), 0)` })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(completed, eq(media.type, "movie"), sql`${media.runtime} > 0`)),

    // Country distribution
    db.select({
      country: sql<string>`jsonb_array_elements_text(${media.originCountry})`,
      count: count(),
    })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(active, sql`${media.originCountry} is not null`))
      .groupBy(sql`jsonb_array_elements_text(${media.originCountry})`)
      .orderBy(desc(count()))
      .limit(10),

    // Language distribution
    db.select({
      language: media.originalLanguage,
      count: count(),
    })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(active, sql`${media.originalLanguage} is not null`))
      .groupBy(media.originalLanguage)
      .orderBy(desc(count()))
      .limit(10),

    // Recent (last 5 years) count
    db.select({ count: count() })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(active, sql`${media.year} >= ${fiveYearsAgo}`)),

    // Total active count
    db.select({ count: count() })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(active),

    // Oldest title
    db.select({ title: media.title, year: media.year })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(active, sql`${media.year} is not null`))
      .orderBy(asc(media.year))
      .limit(1),

    // Perfect scores (10/10)
    db.select({ count: count() })
      .from(userMediaState)
      .where(and(eq(userMediaState.userId, userId), eq(userMediaState.rating, 10))),

    // Lowest ratings (1-3)
    db.select({ count: count() })
      .from(userMediaState)
      .where(and(eq(userMediaState.userId, userId), gt(userMediaState.rating, 0), sql`${userMediaState.rating} <= 3`)),
  ]);

  const totalActive = totalActiveRow?.count ?? 0;
  const recentCount = recentRow?.count ?? 0;

  return {
    decadeDistribution: decadeRows.map((r) => ({ decade: r.decade, count: r.count })),
    hiddenGem: hiddenGemRows[0] ? {
      title: hiddenGemRows[0].title,
      posterPath: hiddenGemRows[0].posterPath,
      backdropPath: hiddenGemRows[0].backdropPath,
      userRating: hiddenGemRows[0].userRating!,
      publicRating: Number(hiddenGemRows[0].publicRating),
    } : null,
    unpopularOpinion: unpopularRows[0] ? {
      title: unpopularRows[0].title,
      posterPath: unpopularRows[0].posterPath,
      backdropPath: unpopularRows[0].backdropPath,
      userRating: unpopularRows[0].userRating!,
      publicRating: Number(unpopularRows[0].publicRating),
    } : null,
    shortestMovie: shortestRows[0]?.runtime ? { title: shortestRows[0].title, runtime: shortestRows[0].runtime } : null,
    longestMovie: longestRows[0]?.runtime ? { title: longestRows[0].title, runtime: longestRows[0].runtime } : null,
    averageRuntime: Number(avgRow?.avg ?? 0),
    countries: countryRows.map((r) => ({ country: r.country, count: r.count })),
    languages: languageRows.filter((r) => r.language !== null).map((r) => ({ language: r.language!, count: r.count })),
    recentPercent: totalActive > 0 ? Math.round((recentCount / totalActive) * 100) : 0,
    oldestTitle: oldestRows[0]?.year ? { title: oldestRows[0].title, year: oldestRows[0].year } : null,
    perfectScores: perfectRow?.count ?? 0,
    lowestRatedCount: lowestRow?.count ?? 0,
  };
}

/**
 * Find all distinct genres across media the user has interacted with
 * (has playback progress or watch history).
 * Returns deduplicated genre {id, name} pairs sorted alphabetically.
 */
export async function findLibraryGenres(
  db: Database,
  userId: string,
): Promise<Array<{ id: number; name: string }>> {
  // Get distinct media IDs the user has any activity for
  const rows = await db
    .select({
      genres: media.genres,
      genreIds: media.genreIds,
    })
    .from(media)
    .where(
      or(
        sql`${media.id} IN (
          SELECT DISTINCT ${userPlaybackProgress.mediaId}
          FROM ${userPlaybackProgress}
          WHERE ${userPlaybackProgress.userId} = ${userId}
            AND ${userPlaybackProgress.deletedAt} IS NULL
        )`,
        sql`${media.id} IN (
          SELECT DISTINCT ${userWatchHistory.mediaId}
          FROM ${userWatchHistory}
          WHERE ${userWatchHistory.userId} = ${userId}
            AND ${userWatchHistory.deletedAt} IS NULL
        )`,
      ),
    );

  // Aggregate genres across all media, deduplicate by id
  const genreMap = new Map<number, string>();
  for (const row of rows) {
    const ids = row.genreIds as number[] | null;
    const names = row.genres as string[] | null;
    if (!ids || !names) continue;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const name = names[i];
      if (id !== undefined && name !== undefined && !genreMap.has(id)) {
        genreMap.set(id, name);
      }
    }
  }

  return [...genreMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
