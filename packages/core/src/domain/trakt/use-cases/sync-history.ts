import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { episode, media, season, userWatchHistory } from "@canto/db/schema";
import { findEpisodeIdByMediaAndNumbers } from "../../../infra/repositories";
import {
  attachRemoteIdToHistorySync,
  createTraktHistorySync,
  findTraktHistorySyncByLocalIds,
  findTraktHistorySyncByRemoteIds,
} from "../../../infra/trakt/trakt-sync-repository";
import { addUserWatchHistory } from "../../../infra/repositories";
import {
  addTraktHistory,
  listTraktHistory,
  type TraktIds,
} from "../../../infra/trakt/trakt.adapter";
import {
  mediaIdsFromRow,
  mediaRefKey,
  parseDateOrNow,
  resolveMediaFromTraktRef,
  type SyncContext,
} from "./shared";

/**
 * Pull Trakt history events into `user_watch_history`.
 *
 * `startAt`, when provided, is forwarded as Trakt's `start_at` query param so
 * we only walk events newer than the coordinator's last successful watermark.
 * The first ever pull (or a forced backfill) passes `undefined` and gets the
 * full history.
 *
 * The per-row `findTraktHistorySyncByRemoteIds` check stays in place because
 * Trakt's `start_at` is inclusive and the watermark itself is replayed on the
 * next run — without the dedup guard we'd double-insert events at the boundary.
 */
export async function pullHistory(
  ctx: SyncContext,
  startAt?: string,
): Promise<void> {
  const remoteRows = await listTraktHistory(
    ctx.accessToken,
    ctx.profileId,
    startAt,
  );
  if (remoteRows.length === 0) return;

  const existingSyncRows = await findTraktHistorySyncByRemoteIds(
    ctx.db,
    ctx.connectionId,
    remoteRows.map((row) => row.remoteHistoryId),
  );
  const syncedRemoteIds = new Set(
    existingSyncRows
      .map((row) => row.remoteHistoryId)
      .filter((id): id is number => typeof id === "number"),
  );

  const resolveCache = new Map<string, string | null>();

  for (const remote of remoteRows) {
    if (syncedRemoteIds.has(remote.remoteHistoryId)) continue;

    // Per-row try/catch keeps a single bad item — flaky TMDB persist, episode
    // resolution miss, transient DB error — from killing the whole pull. The
    // section job's BullMQ retry handles "everything is on fire"; this guard
    // handles "one out of 5000 rows is bad".
    try {
      const mediaId = await resolveMediaFromTraktRef(
        ctx.db,
        remote,
        resolveCache,
      );
      if (!mediaId) continue;

      let episodeId: string | null = null;
      if (
        remote.type === "show" &&
        typeof remote.seasonNumber === "number" &&
        typeof remote.episodeNumber === "number"
      ) {
        episodeId = await findEpisodeIdByMediaAndNumbers(
          ctx.db,
          mediaId,
          remote.seasonNumber,
          remote.episodeNumber,
        );
      }

      const watchedAt = parseDateOrNow(remote.watchedAt, ctx.now);
      const existingLocal = await ctx.db.query.userWatchHistory.findFirst({
        where: and(
          eq(userWatchHistory.userId, ctx.userId),
          eq(userWatchHistory.mediaId, mediaId),
          episodeId
            ? eq(userWatchHistory.episodeId, episodeId)
            : isNull(userWatchHistory.episodeId),
          eq(userWatchHistory.watchedAt, watchedAt),
          isNull(userWatchHistory.deletedAt),
        ),
      });

      let localId = existingLocal?.id;
      if (!localId) {
        const inserted = await addUserWatchHistory(ctx.db, {
          userId: ctx.userId,
          mediaId,
          episodeId: episodeId ?? null,
          watchedAt,
          source: "trakt",
        });
        if (!inserted?.id) continue;
        localId = inserted.id;
      }

      await createTraktHistorySync(ctx.db, {
        userConnectionId: ctx.connectionId,
        localHistoryId: localId,
        remoteHistoryId: remote.remoteHistoryId,
        syncedDirection: "pull",
      });
    } catch (err) {
      console.warn(
        `[trakt-sync] pullHistory: skipped remote=${remote.remoteHistoryId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export async function pushHistory(ctx: SyncContext): Promise<void> {
  const localRows = await ctx.db
    .select({
      id: userWatchHistory.id,
      mediaId: userWatchHistory.mediaId,
      watchedAt: userWatchHistory.watchedAt,
      type: media.type,
      provider: media.provider,
      externalId: media.externalId,
      imdbId: media.imdbId,
      tvdbId: media.tvdbId,
      seasonNumber: season.number,
      episodeNumber: episode.number,
    })
    .from(userWatchHistory)
    .innerJoin(media, eq(userWatchHistory.mediaId, media.id))
    .leftJoin(episode, eq(userWatchHistory.episodeId, episode.id))
    .leftJoin(season, eq(episode.seasonId, season.id))
    .where(
      and(
        eq(userWatchHistory.userId, ctx.userId),
        isNull(userWatchHistory.deletedAt),
        ne(userWatchHistory.source, "trakt"),
      ),
    )
    .orderBy(desc(userWatchHistory.watchedAt))
    .limit(200);

  if (localRows.length === 0) return;

  const syncRows = await findTraktHistorySyncByLocalIds(
    ctx.db,
    ctx.connectionId,
    localRows.map((row) => row.id),
  );
  const syncedLocalIds = new Set(
    syncRows
      .map((row) => row.localHistoryId)
      .filter((id): id is string => typeof id === "string"),
  );

  const unsynced = localRows.filter((row) => !syncedLocalIds.has(row.id));
  if (unsynced.length === 0) return;

  const movies: Array<{ ids: TraktIds; watched_at: string }> = [];
  const showEpisodesByKey = new Map<
    string,
    {
      ids: TraktIds;
      seasons: Map<number, Array<{ number: number; watched_at: string }>>;
    }
  >();
  const showNoEpisode: Array<{ ids: TraktIds; watched_at: string }> = [];

  for (const row of unsynced) {
    const ids = mediaIdsFromRow(row);
    const watchedAt = row.watchedAt.toISOString();

    if (row.type === "movie") {
      movies.push({ ids, watched_at: watchedAt });
      continue;
    }

    if (
      typeof row.seasonNumber === "number" &&
      typeof row.episodeNumber === "number"
    ) {
      const key = mediaRefKey("show", ids);
      if (!key) continue;
      const existing = showEpisodesByKey.get(key) ?? {
        ids,
        seasons: new Map<
          number,
          Array<{ number: number; watched_at: string }>
        >(),
      };
      const episodes = existing.seasons.get(row.seasonNumber) ?? [];
      episodes.push({
        number: row.episodeNumber,
        watched_at: watchedAt,
      });
      existing.seasons.set(row.seasonNumber, episodes);
      showEpisodesByKey.set(key, existing);
    } else {
      showNoEpisode.push({ ids, watched_at: watchedAt });
    }
  }

  const showsWithSeasons = [...showEpisodesByKey.values()].map((entry) => ({
    ids: entry.ids,
    seasons: [...entry.seasons.entries()].map(([number, episodes]) => ({
      number,
      episodes,
    })),
  }));

  const body = {
    ...(movies.length > 0 ? { movies } : {}),
    ...(showNoEpisode.length > 0 || showsWithSeasons.length > 0
      ? {
          shows: [...showNoEpisode, ...showsWithSeasons],
        }
      : {}),
  };

  if (!("movies" in body) && !("shows" in body)) return;

  await addTraktHistory(ctx.accessToken, body);

  for (const row of unsynced) {
    await createTraktHistorySync(ctx.db, {
      userConnectionId: ctx.connectionId,
      localHistoryId: row.id,
      syncedDirection: "push",
    });
  }
}

export async function linkPulledHistoryBackfill(
  ctx: SyncContext,
): Promise<void> {
  const remoteRows = await listTraktHistory(ctx.accessToken, ctx.profileId);
  if (remoteRows.length === 0) return;

  const existingSyncRows = await findTraktHistorySyncByRemoteIds(
    ctx.db,
    ctx.connectionId,
    remoteRows.map((row) => row.remoteHistoryId),
  );
  const syncedRemoteIds = new Set(
    existingSyncRows
      .map((row) => row.remoteHistoryId)
      .filter((id): id is number => typeof id === "number"),
  );

  const resolveCache = new Map<string, string | null>();

  for (const remote of remoteRows) {
    if (syncedRemoteIds.has(remote.remoteHistoryId)) continue;
    const mediaId = await resolveMediaFromTraktRef(
      ctx.db,
      remote,
      resolveCache,
    );
    if (!mediaId) continue;

    let episodeId: string | null = null;
    if (
      remote.type === "show" &&
      typeof remote.seasonNumber === "number" &&
      typeof remote.episodeNumber === "number"
    ) {
      episodeId = await findEpisodeIdByMediaAndNumbers(
        ctx.db,
        mediaId,
        remote.seasonNumber,
        remote.episodeNumber,
      );
    }

    const watchedAt = parseDateOrNow(remote.watchedAt, ctx.now);
    const localMatch = await ctx.db.query.userWatchHistory.findFirst({
      where: and(
        eq(userWatchHistory.userId, ctx.userId),
        eq(userWatchHistory.mediaId, mediaId),
        episodeId
          ? eq(userWatchHistory.episodeId, episodeId)
          : isNull(userWatchHistory.episodeId),
        eq(userWatchHistory.watchedAt, watchedAt),
        isNull(userWatchHistory.deletedAt),
      ),
      orderBy: [desc(userWatchHistory.id)],
    });
    if (!localMatch) continue;

    await attachRemoteIdToHistorySync(
      ctx.db,
      ctx.connectionId,
      localMatch.id,
      remote.remoteHistoryId,
    );
  }
}
