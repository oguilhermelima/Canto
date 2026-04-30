import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql  } from "drizzle-orm";
import type {SQL} from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  episode,
  list,
  listItem,
  media,
  season,
  userHiddenMedia,
  userMediaState,
  userPlaybackProgress,
  userWatchHistory,
} from "@canto/db/schema";
import { episodeI18n, mediaI18n } from "@canto/core/infra/shared/media-i18n";

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
  userRating: number | null;
  genres: unknown;
  genreIds: unknown;
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
  q?: string;
  source?: "jellyfin" | "plex" | "trakt" | "manual";
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
  watchedFrom?: string;
  watchedTo?: string;
}

function buildTitleIlikeCondition(
  q: string | undefined,
  titleExpr: SQL,
): SQL | null {
  if (!q || q.length === 0) return null;
  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return sql`${titleExpr} ILIKE ${pattern}`;
}

export async function findUserPlaybackProgressFeed(
  db: Database,
  userId: string,
  language: string,
  mediaType?: "movie" | "show",
  filters?: LibraryFeedFilterOptions,
): Promise<UserPlaybackProgressFeedRow[]> {
  const mi = mediaI18n(language);
  const ei = episodeI18n(language);

  const conditions = [
    eq(userPlaybackProgress.userId, userId),
    isNull(userPlaybackProgress.deletedAt),
  ];
  if (mediaType) conditions.push(eq(media.type, mediaType));
  const titleLike = buildTitleIlikeCondition(filters?.q, mi.title);
  if (titleLike) conditions.push(titleLike);
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
  if (filters?.watchedFrom)
    conditions.push(gte(userPlaybackProgress.lastWatchedAt, new Date(filters.watchedFrom)));
  if (filters?.watchedTo)
    conditions.push(lte(userPlaybackProgress.lastWatchedAt, new Date(filters.watchedTo)));

  const orderClauses = (() => {
    switch (filters?.sortBy) {
      case "name_asc": return [sql`${mi.title} ASC`, desc(userPlaybackProgress.id)];
      case "name_desc": return [sql`${mi.title} DESC`, desc(userPlaybackProgress.id)];
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
      title: mi.title,
      posterPath: mi.posterPath,
      backdropPath: media.backdropPath,
      logoPath: mi.logoPath,
      overview: mi.overview,
      voteAverage: media.voteAverage,
      userRating: userMediaState.rating,
      genres: media.genres,
      genreIds: media.genreIds,
      year: media.year,
      mediaRuntime: media.runtime,
      externalId: media.externalId,
      provider: media.provider,
      episodeNumber: episode.number,
      episodeTitle: ei.title,
      seasonNumber: season.number,
      episodeRuntime: episode.runtime,
    })
    .from(userPlaybackProgress)
    .innerJoin(media, eq(userPlaybackProgress.mediaId, media.id))
    .leftJoin(mi.locUser, mi.locUserJoin)
    .leftJoin(mi.locEn, mi.locEnJoin)
    .leftJoin(episode, eq(userPlaybackProgress.episodeId, episode.id))
    .leftJoin(ei.locUser, ei.locUserJoin)
    .leftJoin(ei.locEn, ei.locEnJoin)
    .leftJoin(season, eq(episode.seasonId, season.id))
    .leftJoin(
      userMediaState,
      and(
        eq(userMediaState.mediaId, userPlaybackProgress.mediaId),
        eq(userMediaState.userId, userId),
      ),
    )
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
  backdropPath: string | null;
  logoPath: string | null;
  year: number | null;
  voteAverage: number | null;
  userRating: number | null;
  externalId: number;
  provider: string;
  episodeNumber: number | null;
  episodeTitle: string | null;
  seasonNumber: number | null;
}

export async function findUserWatchHistoryFeed(
  db: Database,
  userId: string,
  language: string,
  limit = 100,
  mediaType?: "movie" | "show",
  filters?: LibraryFeedFilterOptions,
): Promise<UserWatchHistoryFeedRow[]> {
  const mi = mediaI18n(language);
  const ei = episodeI18n(language);

  const conditions = [
    eq(userWatchHistory.userId, userId),
    isNull(userWatchHistory.deletedAt),
  ];
  if (mediaType) conditions.push(eq(media.type, mediaType));
  const titleLike = buildTitleIlikeCondition(filters?.q, mi.title);
  if (titleLike) conditions.push(titleLike);
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
  if (filters?.watchedFrom)
    conditions.push(gte(userWatchHistory.watchedAt, new Date(filters.watchedFrom)));
  if (filters?.watchedTo)
    conditions.push(lte(userWatchHistory.watchedAt, new Date(filters.watchedTo)));

  const orderClauses = (() => {
    switch (filters?.sortBy) {
      case "name_asc": return [sql`${mi.title} ASC`, desc(userWatchHistory.id)];
      case "name_desc": return [sql`${mi.title} DESC`, desc(userWatchHistory.id)];
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
      title: mi.title,
      posterPath: mi.posterPath,
      backdropPath: media.backdropPath,
      logoPath: mi.logoPath,
      year: media.year,
      voteAverage: media.voteAverage,
      userRating: userMediaState.rating,
      externalId: media.externalId,
      provider: media.provider,
      episodeNumber: episode.number,
      episodeTitle: ei.title,
      seasonNumber: season.number,
    })
    .from(userWatchHistory)
    .innerJoin(media, eq(userWatchHistory.mediaId, media.id))
    .leftJoin(mi.locUser, mi.locUserJoin)
    .leftJoin(mi.locEn, mi.locEnJoin)
    .leftJoin(episode, eq(userWatchHistory.episodeId, episode.id))
    .leftJoin(ei.locUser, ei.locUserJoin)
    .leftJoin(ei.locEn, ei.locEnJoin)
    .leftJoin(season, eq(episode.seasonId, season.id))
    .leftJoin(
      userMediaState,
      and(
        eq(userMediaState.mediaId, userWatchHistory.mediaId),
        eq(userMediaState.userId, userId),
      ),
    )
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
  logoPath: string | null;
  year: number | null;
  releaseDate: string | null;
  externalId: number;
  provider: string;
  airsTime: string | null;
  originCountry: string[] | null;
}

export async function findUserListMediaCandidates(
  db: Database,
  userId: string,
  language: string,
  mediaType?: "movie" | "show",
  limit?: number,
): Promise<UserListMediaCandidateRow[]> {
  const conditions = [
    eq(list.userId, userId),
    isNull(list.deletedAt),
    isNull(listItem.deletedAt),
    or(eq(list.type, "watchlist"), eq(list.type, "custom")),
  ];
  if (mediaType) conditions.push(eq(media.type, mediaType));

  const mi = mediaI18n(language);

  const query = db
    .select({
      listId: list.id,
      listName: list.name,
      listType: list.type,
      addedAt: listItem.addedAt,
      mediaId: media.id,
      mediaType: media.type,
      title: mi.title,
      posterPath: mi.posterPath,
      backdropPath: media.backdropPath,
      logoPath: mi.logoPath,
      year: media.year,
      releaseDate: media.releaseDate,
      externalId: media.externalId,
      provider: media.provider,
      airsTime: media.airsTime,
      originCountry: media.originCountry,
    })
    .from(listItem)
    .innerJoin(list, eq(listItem.listId, list.id))
    .innerJoin(media, eq(listItem.mediaId, media.id))
    .leftJoin(mi.locUser, mi.locUserJoin)
    .leftJoin(mi.locEn, mi.locEnJoin)
    .where(and(...conditions))
    .orderBy(desc(listItem.addedAt), desc(listItem.id));

  return limit !== undefined ? query.limit(limit) : query;
}

// ── Continue Watching feed ─────────────────────────────────────────────────
//
// Focused query for the "Continue Watching" rail / library tab. Unlike
// `findUserPlaybackProgressFeed`, the source-IN ('jellyfin','plex','trakt')
// + is_completed=false + position>0 predicates are pushed into SQL so we
// don't fetch rows we'll throw away in JS, and pagination is keyset on
// (lastWatchedAt, id) so the index `idx_user_playback_active` can serve the
// page directly.
//
// Trailer keys are intentionally NOT selected here — callers should batch
// them via `findTrailerKeysForMediaIds` after the main query, mirroring the
// pattern used by recommendations. This keeps the planner away from the
// per-row correlated subquery in `mediaI18n.trailerKey`.

export interface ContinueWatchingFeedRow {
  id: string;
  mediaId: string;
  episodeId: string | null;
  positionSeconds: number;
  isCompleted: boolean;
  lastWatchedAt: Date;
  source: "jellyfin" | "plex" | "trakt";
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  overview: string | null;
  voteAverage: number | null;
  genres: unknown;
  genreIds: unknown;
  year: number | null;
  mediaRuntime: number | null;
  externalId: number;
  provider: string;
  episodeNumber: number | null;
  episodeTitle: string | null;
  seasonNumber: number | null;
  episodeRuntime: number | null;
}

export interface ContinueWatchingKeysetCursor {
  lastWatchedAt: Date;
  id: string;
}

const CONTINUE_WATCHING_SOURCES = ["jellyfin", "plex", "trakt"] as const;

export async function findContinueWatchingFeed(
  db: Database,
  userId: string,
  language: string,
  opts: {
    limit: number;
    cursor?: ContinueWatchingKeysetCursor | null;
    mediaType?: "movie" | "show";
    filters?: LibraryFeedFilterOptions;
  },
): Promise<ContinueWatchingFeedRow[]> {
  const { limit, cursor, mediaType, filters } = opts;

  const conditions: SQL[] = [
    eq(userPlaybackProgress.userId, userId),
    isNull(userPlaybackProgress.deletedAt),
    eq(userPlaybackProgress.isCompleted, false),
    gt(userPlaybackProgress.positionSeconds, 0),
    isNotNull(userPlaybackProgress.lastWatchedAt),
  ];

  // Constrain to the three sources that actually back Continue Watching.
  // If the caller also passes a more specific filter, the intersection
  // collapses naturally (e.g., source=manual yields zero rows).
  if (filters?.source) {
    if (
      (CONTINUE_WATCHING_SOURCES as readonly string[]).includes(filters.source)
    ) {
      conditions.push(eq(userPlaybackProgress.source, filters.source));
    } else {
      // Asked for a non-continue source (e.g., 'manual') — return empty.
      conditions.push(sql`false`);
    }
  } else {
    conditions.push(
      inArray(
        userPlaybackProgress.source,
        CONTINUE_WATCHING_SOURCES as unknown as string[],
      ),
    );
  }

  const mi = mediaI18n(language);
  const ei = episodeI18n(language);

  if (mediaType) conditions.push(eq(media.type, mediaType));
  const titleLike = buildTitleIlikeCondition(filters?.q, mi.title);
  if (titleLike) conditions.push(titleLike);
  if (filters?.yearMin !== undefined)
    conditions.push(gte(media.year, filters.yearMin));
  if (filters?.yearMax !== undefined)
    conditions.push(lte(media.year, filters.yearMax));
  if (filters?.genreIds && filters.genreIds.length > 0) {
    conditions.push(
      sql`${media.genreIds}::jsonb @> ${JSON.stringify(filters.genreIds)}::jsonb`,
    );
  }
  if (filters?.scoreMin !== undefined)
    conditions.push(gte(media.voteAverage, filters.scoreMin));
  if (filters?.scoreMax !== undefined)
    conditions.push(lte(media.voteAverage, filters.scoreMax));
  if (filters?.runtimeMin !== undefined)
    conditions.push(gte(media.runtime, filters.runtimeMin));
  if (filters?.runtimeMax !== undefined)
    conditions.push(lte(media.runtime, filters.runtimeMax));
  if (filters?.language)
    conditions.push(eq(media.originalLanguage, filters.language));
  if (filters?.certification)
    conditions.push(eq(media.contentRating, filters.certification));
  if (filters?.tvStatus) conditions.push(eq(media.status, filters.tvStatus));

  // Keyset cursor on (lastWatchedAt DESC, id DESC). The partial index
  // `idx_user_playback_active` orders rows the same way, so the planner can
  // skip directly to the cursor row.
  if (cursor) {
    conditions.push(
      or(
        lt(userPlaybackProgress.lastWatchedAt, cursor.lastWatchedAt),
        and(
          eq(userPlaybackProgress.lastWatchedAt, cursor.lastWatchedAt),
          lt(userPlaybackProgress.id, cursor.id),
        ),
      )!,
    );
  }

  const rows = await db
    .select({
      id: userPlaybackProgress.id,
      mediaId: userPlaybackProgress.mediaId,
      episodeId: userPlaybackProgress.episodeId,
      positionSeconds: userPlaybackProgress.positionSeconds,
      isCompleted: userPlaybackProgress.isCompleted,
      lastWatchedAt: userPlaybackProgress.lastWatchedAt,
      source: userPlaybackProgress.source,
      mediaType: media.type,
      title: mi.title,
      posterPath: mi.posterPath,
      backdropPath: media.backdropPath,
      logoPath: mi.logoPath,
      overview: mi.overview,
      voteAverage: media.voteAverage,
      genres: media.genres,
      genreIds: media.genreIds,
      year: media.year,
      mediaRuntime: media.runtime,
      externalId: media.externalId,
      provider: media.provider,
      episodeNumber: episode.number,
      episodeTitle: ei.title,
      seasonNumber: season.number,
      episodeRuntime: episode.runtime,
    })
    .from(userPlaybackProgress)
    .innerJoin(media, eq(userPlaybackProgress.mediaId, media.id))
    .leftJoin(mi.locUser, mi.locUserJoin)
    .leftJoin(mi.locEn, mi.locEnJoin)
    .leftJoin(episode, eq(userPlaybackProgress.episodeId, episode.id))
    .leftJoin(ei.locUser, ei.locUserJoin)
    .leftJoin(ei.locEn, ei.locEnJoin)
    .leftJoin(season, eq(episode.seasonId, season.id))
    .where(and(...conditions))
    .orderBy(desc(userPlaybackProgress.lastWatchedAt), desc(userPlaybackProgress.id))
    .limit(limit);

  return rows
    .filter(
      (
        row,
      ): row is typeof row & {
        lastWatchedAt: Date;
        source: "jellyfin" | "plex" | "trakt";
      } =>
        row.lastWatchedAt !== null &&
        (row.source === "jellyfin" ||
          row.source === "plex" ||
          row.source === "trakt"),
    );
}

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
  year: number | null;
  externalId: number;
  provider: string;
}

export async function findUserMediaPaginated(
  db: Database,
  userId: string,
  language: string,
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

  const mi = mediaI18n(language);

  const sortDir = opts.sortOrder === "asc" ? asc : desc;
  const sortColumn = (() => {
    switch (opts.sortBy) {
      case "rating": return userMediaState.rating;
      case "title": return mi.title;
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
    title: mi.title,
    posterPath: mi.posterPath,
    backdropPath: media.backdropPath,
    logoPath: mi.logoPath,
    overview: mi.overview,
    voteAverage: media.voteAverage,
    genres: media.genres,
    genreIds: media.genreIds,
    year: media.year,
    externalId: media.externalId,
    provider: media.provider,
  };

  // Stable secondary sort by mediaId. The Trakt timestamp backfill landed
  // many rows on the same `updated_at` (per-day or coarser granularity), so
  // ORDER BY updated_at alone is non-deterministic across pages and the
  // offset paginator silently duplicates/skips rows. Tiebreaking on
  // `mediaId` (the row's stable PK) makes the order total.
  const itemsQuery = db
    .select(selectFields)
    .from(userMediaState)
    .innerJoin(media, eq(userMediaState.mediaId, media.id))
    .leftJoin(mi.locUser, mi.locUserJoin)
    .leftJoin(mi.locEn, mi.locEnJoin)
    .where(where)
    .orderBy(
      sortDir(sortColumn),
      desc(userMediaState.updatedAt),
      desc(userMediaState.mediaId),
    )
    .limit(opts.limit)
    .offset(opts.offset);

  const [items, [countRow]] = await Promise.all([
    itemsQuery,
    db
      .select({ total: count() })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(where),
  ]);

  return { items, total: countRow?.total ?? 0 };
}

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
    const ids = row.genreIds;
    const names = row.genres;
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
