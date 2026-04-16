import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  ne,
} from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  episode,
  list,
  listItem,
  media,
  traktListLink,
  season,
  userConnection,
  userMediaState,
  userRating,
  userWatchHistory,
} from "@canto/db/schema";
import {
  addListItem,
  createList,
  deleteUserRating,
  findMediaByAnyReference,
  findEpisodeIdByMediaAndNumbers,
  removeListItem,
  upsertUserMediaState,
  upsertUserRating,
} from "../../infrastructure/repositories";
import {
  attachRemoteIdToHistorySync,
  createTraktHistorySync,
  findTraktHistorySyncByLocalIds,
  findTraktHistorySyncByRemoteIds,
  findTraktListLinksByConnection,
  findTraktSyncStateByConnection,
  upsertTraktListLink,
  upsertTraktSyncState,
} from "../../infrastructure/repositories/trakt-sync-repository";
import {
  addItemsToTraktList,
  addToTraktWatchlist,
  addTraktFavorites,
  addTraktHistory,
  addTraktRatings,
  createTraktList,
  deleteTraktList,
  listTraktFavorites,
  listTraktHistory,
  listTraktListItems,
  listTraktPersonalLists,
  listTraktRatings,
  listTraktWatchlist,
  refreshTraktToken,
  removeItemsFromTraktList,
  removeFromTraktWatchlist,
  removeTraktFavorites,
  removeTraktRatings,
  type TraktIds,
  type TraktMediaRef,
  type TraktTokenResponse,
} from "../../infrastructure/adapters/trakt";
import { updateUserConnection } from "../../infrastructure/repositories/user-connection-repository";
import { slugify } from "../rules/slugify";
import { persistMediaUseCase } from "./persist-media";
import { getTmdbProvider } from "../../lib/tmdb-client";
import { getTvdbProvider } from "../../lib/tvdb-client";
import { addUserWatchHistory } from "../../infrastructure/repositories/user-media-repository";

const CONFLICT_WINDOW_MS = 10 * 60 * 1000;

interface LocalMediaRef {
  mediaId: string;
  type: "movie" | "show";
  ids: TraktIds;
  occurredAt: Date;
}

interface LocalRatingRef extends LocalMediaRef {
  rating: number;
}

interface SyncContext {
  db: Database;
  userId: string;
  connectionId: string;
  accessToken: string;
  profileId: string;
  initialSync: boolean;
  now: Date;
}

function mediaRefKey(type: "movie" | "show", ids: TraktIds): string | null {
  if (typeof ids.tmdb === "number") return `${type}:tmdb:${ids.tmdb}`;
  if (typeof ids.imdb === "string" && ids.imdb.length > 0) {
    return `${type}:imdb:${ids.imdb}`;
  }
  if (typeof ids.tvdb === "number") return `${type}:tvdb:${ids.tvdb}`;
  if (typeof ids.trakt === "number") return `${type}:trakt:${ids.trakt}`;
  return null;
}

function mediaIdsFromRow(row: {
  type: string;
  provider: string;
  externalId: number;
  imdbId: string | null;
  tvdbId: number | null;
}): TraktIds {
  return {
    tmdb: row.provider === "tmdb" ? row.externalId : undefined,
    tvdb: row.provider === "tvdb" ? row.externalId : (row.tvdbId ?? undefined),
    imdb: row.imdbId ?? undefined,
  };
}

function withinConflictWindow(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= CONFLICT_WINDOW_MS;
}

function parseDateOrNow(value: string | undefined, now: Date): Date {
  if (!value) return now;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return now;
  return parsed;
}

function dedupeByKey<T extends { type: "movie" | "show"; ids: TraktIds }>(
  refs: T[],
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = mediaRefKey(ref.type, ref.ids);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

function toTraktListBody(refs: Array<{ type: "movie" | "show"; ids: TraktIds; watchedAt?: string }>) {
  const movies = refs
    .filter((ref) => ref.type === "movie")
    .map((ref) => ({
      ids: ref.ids,
      watched_at: ref.watchedAt,
    }));
  const shows = refs
    .filter((ref) => ref.type === "show")
    .map((ref) => ({
      ids: ref.ids,
      watched_at: ref.watchedAt,
    }));

  return {
    ...(movies.length > 0 ? { movies } : {}),
    ...(shows.length > 0 ? { shows } : {}),
  };
}

function toTraktFavoritesBody(refs: Array<{ type: "movie" | "show"; ids: TraktIds }>) {
  const movies = refs
    .filter((ref) => ref.type === "movie")
    .map((ref) => ({ ids: ref.ids }));
  const shows = refs
    .filter((ref) => ref.type === "show")
    .map((ref) => ({ ids: ref.ids }));

  return {
    ...(movies.length > 0 ? { movies } : {}),
    ...(shows.length > 0 ? { shows } : {}),
  };
}

function toTraktRatingsBody(refs: Array<{ type: "movie" | "show"; ids: TraktIds; rating: number }>) {
  const movies = refs
    .filter((ref) => ref.type === "movie")
    .map((ref) => ({ ids: ref.ids, rating: ref.rating }));
  const shows = refs
    .filter((ref) => ref.type === "show")
    .map((ref) => ({ ids: ref.ids, rating: ref.rating }));

  return {
    ...(movies.length > 0 ? { movies } : {}),
    ...(shows.length > 0 ? { shows } : {}),
  };
}

async function refreshTraktAccessTokenIfNeeded(
  db: Database,
  conn: typeof userConnection.$inferSelect,
): Promise<{ accessToken: string; tokenResponse?: TraktTokenResponse }> {
  const accessToken = conn.token;
  if (!accessToken) {
    throw new Error(`Trakt connection ${conn.id} has no access token`);
  }

  const expiresAt = conn.tokenExpiresAt;
  const shouldRefresh = !!(
    conn.refreshToken &&
    expiresAt &&
    expiresAt.getTime() <= Date.now() + 30_000
  );

  if (!shouldRefresh) {
    return { accessToken };
  }

  const refreshed = await refreshTraktToken(conn.refreshToken!);
  const nextExpiresAt = new Date(
    (refreshed.created_at + refreshed.expires_in) * 1000,
  );

  await updateUserConnection(db, conn.id, {
    token: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    tokenExpiresAt: nextExpiresAt,
    staleReason: null,
  });

  return { accessToken: refreshed.access_token, tokenResponse: refreshed };
}

async function resolveMediaFromTraktRef(
  db: Database,
  ref: TraktMediaRef,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const key = mediaRefKey(ref.type, ref.ids);
  if (!key) return null;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const byAnyReference = await findMediaByAnyReference(
    db,
    ref.ids.tmdb ?? ref.ids.tvdb ?? 0,
    ref.ids.tmdb ? "tmdb" : "tvdb",
    ref.ids.imdb,
    ref.ids.tvdb,
    ref.type,
  );
  if (byAnyReference?.id) {
    cache.set(key, byAnyReference.id);
    return byAnyReference.id;
  }

  if (typeof ref.ids.tmdb === "number") {
    try {
      const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
      const persisted = await persistMediaUseCase(
        db,
        {
          externalId: ref.ids.tmdb,
          provider: "tmdb",
          type: ref.type,
        },
        { tmdb, tvdb },
      );
      if (persisted?.id) {
        cache.set(key, persisted.id);
        return persisted.id;
      }
    } catch (err) {
      console.warn(
        `[trakt-sync] Failed to persist TMDB media ${ref.ids.tmdb}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (typeof ref.ids.tvdb === "number") {
    try {
      const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
      const persisted = await persistMediaUseCase(
        db,
        {
          externalId: ref.ids.tvdb,
          provider: "tvdb",
          type: ref.type,
        },
        { tmdb, tvdb },
      );
      if (persisted?.id) {
        cache.set(key, persisted.id);
        return persisted.id;
      }
    } catch (err) {
      console.warn(
        `[trakt-sync] Failed to persist TVDB media ${ref.ids.tvdb}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  cache.set(key, null);
  return null;
}

async function findOrCreateUniqueListSlug(
  db: Database,
  userId: string,
  baseSlug: string,
): Promise<string> {
  const normalized = slugify(baseSlug) || "trakt-list";
  let candidate = normalized;
  let i = 1;

  while (true) {
    const existing = await db.query.list.findFirst({
      where: and(eq(list.userId, userId), eq(list.slug, candidate)),
    });
    if (!existing) return candidate;
    i += 1;
    candidate = `${normalized}-${i}`;
  }
}

function decidePresenceAction(
  occurredAt: Date,
  now: Date,
  initialSync: boolean,
): "keep-presence" | "keep-absence" {
  if (initialSync) return "keep-presence";
  if (withinConflictWindow(occurredAt, now)) return "keep-presence";
  return "keep-absence";
}

async function loadLocalListRefs(
  db: Database,
  listId: string,
): Promise<LocalMediaRef[]> {
  const rows = await db
    .select({
      mediaId: listItem.mediaId,
      addedAt: listItem.addedAt,
      type: media.type,
      provider: media.provider,
      externalId: media.externalId,
      imdbId: media.imdbId,
      tvdbId: media.tvdbId,
    })
    .from(listItem)
    .innerJoin(media, eq(listItem.mediaId, media.id))
    .where(eq(listItem.listId, listId));

  return rows
    .flatMap((row): LocalMediaRef[] => {
      if (row.type !== "movie" && row.type !== "show") return [];
      const mapped: LocalMediaRef = {
        mediaId: row.mediaId,
        type: row.type,
        ids: mediaIdsFromRow(row),
        occurredAt: row.addedAt,
      };
      return mediaRefKey(mapped.type, mapped.ids) ? [mapped] : [];
    });
}

async function syncSingleListMembership(
  ctx: SyncContext,
  localListId: string,
  remoteRefs: TraktMediaRef[],
  pushToRemote: (refs: Array<{ type: "movie" | "show"; ids: TraktIds }>) => Promise<void>,
  removeFromRemote: (refs: Array<{ type: "movie" | "show"; ids: TraktIds }>) => Promise<void>,
): Promise<void> {
  const localRefs = await loadLocalListRefs(ctx.db, localListId);

  const localByKey = new Map<string, LocalMediaRef>();
  for (const local of localRefs) {
    const key = mediaRefKey(local.type, local.ids);
    if (!key) continue;
    localByKey.set(key, local);
  }

  const remoteByKey = new Map<string, TraktMediaRef>();
  for (const remote of remoteRefs) {
    const key = mediaRefKey(remote.type, remote.ids);
    if (!key) continue;
    remoteByKey.set(key, remote);
  }

  const keys = new Set<string>([
    ...localByKey.keys(),
    ...remoteByKey.keys(),
  ]);

  const addLocalMediaIds: string[] = [];
  const removeLocalMediaIds: string[] = [];
  const addRemoteRefs: Array<{ type: "movie" | "show"; ids: TraktIds }> = [];
  const removeRemoteRefs: Array<{ type: "movie" | "show"; ids: TraktIds }> = [];

  const resolveCache = new Map<string, string | null>();

  for (const key of keys) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);
    if (local && remote) continue;

    if (local && !remote) {
      const action = decidePresenceAction(local.occurredAt, ctx.now, ctx.initialSync);
      if (action === "keep-presence") {
        addRemoteRefs.push({ type: local.type, ids: local.ids });
      } else {
        removeLocalMediaIds.push(local.mediaId);
      }
      continue;
    }

    if (!local && remote) {
      const remoteAt = parseDateOrNow(remote.listedAt, ctx.now);
      const action = decidePresenceAction(remoteAt, ctx.now, ctx.initialSync);
      const mediaId = await resolveMediaFromTraktRef(ctx.db, remote, resolveCache);
      if (!mediaId) continue;

      if (action === "keep-presence") {
        addLocalMediaIds.push(mediaId);
      } else {
        removeRemoteRefs.push({ type: remote.type, ids: remote.ids });
      }
    }
  }

  const uniqueAddLocal = [...new Set(addLocalMediaIds)];
  const uniqueRemoveLocal = [...new Set(removeLocalMediaIds)];

  for (const mediaId of uniqueAddLocal) {
    await addListItem(ctx.db, { listId: localListId, mediaId });
  }

  for (const mediaId of uniqueRemoveLocal) {
    await removeListItem(ctx.db, localListId, mediaId);
  }

  const dedupedRemoteAdds = dedupeByKey(addRemoteRefs);
  const dedupedRemoteRemoves = dedupeByKey(removeRemoteRefs);

  if (dedupedRemoteAdds.length > 0) {
    await pushToRemote(dedupedRemoteAdds);
  }
  if (dedupedRemoteRemoves.length > 0) {
    await removeFromRemote(dedupedRemoteRemoves);
  }
}

async function syncWatchlist(ctx: SyncContext): Promise<void> {
  const watchlist = await ctx.db.query.list.findFirst({
    where: and(eq(list.userId, ctx.userId), eq(list.type, "watchlist")),
  });
  if (!watchlist) return;

  const remoteWatchlist = await listTraktWatchlist(ctx.accessToken, ctx.profileId);

  await syncSingleListMembership(
    ctx,
    watchlist.id,
    remoteWatchlist,
    (refs) => addToTraktWatchlist(ctx.accessToken, toTraktListBody(refs)),
    (refs) => removeFromTraktWatchlist(ctx.accessToken, toTraktListBody(refs)),
  );
}

async function syncCustomLists(ctx: SyncContext): Promise<void> {
  const remoteLists = await listTraktPersonalLists(ctx.accessToken, ctx.profileId);
  const links = await findTraktListLinksByConnection(ctx.db, ctx.connectionId);
  const linksByRemoteId = new Map(links.map((link) => [link.traktListId, link]));

  let localCustomLists = await ctx.db.query.list.findMany({
    where: and(eq(list.userId, ctx.userId), eq(list.type, "custom")),
    orderBy: [asc(list.createdAt)],
  });
  const localById = new Map(localCustomLists.map((row) => [row.id, row]));
  const remoteIds = new Set(remoteLists.map((row) => row.ids.trakt));

  if (!ctx.initialSync) {
    for (const link of links) {
      if (!remoteIds.has(link.traktListId)) {
        if (localById.has(link.localListId)) {
          await ctx.db
            .delete(list)
            .where(
              and(
                eq(list.id, link.localListId),
                eq(list.userId, ctx.userId),
                eq(list.type, "custom"),
              ),
            );
        }
        await ctx.db
          .delete(traktListLink)
          .where(eq(traktListLink.id, link.id));
      }
    }

    for (const link of links) {
      if (localById.has(link.localListId)) continue;
      try {
        await deleteTraktList(ctx.accessToken, link.traktListId);
      } catch (err) {
        console.warn(
          `[trakt-sync] Failed to delete remote Trakt list ${link.traktListId}:`,
          err instanceof Error ? err.message : err,
        );
      }
      await ctx.db
        .delete(traktListLink)
        .where(eq(traktListLink.id, link.id));
    }

    localCustomLists = await ctx.db.query.list.findMany({
      where: and(eq(list.userId, ctx.userId), eq(list.type, "custom")),
      orderBy: [asc(list.createdAt)],
    });
  }

  for (const remote of remoteLists) {
    const linked = linksByRemoteId.get(remote.ids.trakt);
    let localListId = linked?.localListId;

    if (!localListId) {
      const slug = await findOrCreateUniqueListSlug(
        ctx.db,
        ctx.userId,
        remote.ids.slug,
      );
      const created = await createList(ctx.db, {
        userId: ctx.userId,
        name: remote.name,
        slug,
        description: remote.description ?? undefined,
        type: "custom",
        visibility: "private",
      });
      localListId = created.id;
    }

    await upsertTraktListLink(ctx.db, {
      userConnectionId: ctx.connectionId,
      traktListId: remote.ids.trakt,
      traktListSlug: remote.ids.slug,
      localListId,
      remoteUpdatedAt: new Date(remote.updated_at),
      lastSyncedAt: ctx.now,
    });
  }

  const refreshedLinks = await findTraktListLinksByConnection(ctx.db, ctx.connectionId);
  const refreshedByLocalId = new Map(refreshedLinks.map((link) => [link.localListId, link]));

  for (const localCustom of localCustomLists) {
    if (refreshedByLocalId.has(localCustom.id)) continue;

    const remoteCreated = await createTraktList(ctx.accessToken, {
      name: localCustom.name,
      description: localCustom.description,
      privacy: localCustom.visibility === "public" ? "public" : "private",
    });
    await upsertTraktListLink(ctx.db, {
      userConnectionId: ctx.connectionId,
      traktListId: remoteCreated.ids.trakt,
      traktListSlug: remoteCreated.ids.slug,
      localListId: localCustom.id,
      remoteUpdatedAt: new Date(remoteCreated.updated_at),
      lastSyncedAt: ctx.now,
    });
  }

  const finalLinks = await findTraktListLinksByConnection(ctx.db, ctx.connectionId);
  for (const linkRow of finalLinks) {
    const remoteItems = await listTraktListItems(
      ctx.accessToken,
      linkRow.traktListId,
      ctx.profileId,
    );

    await syncSingleListMembership(
      ctx,
      linkRow.localListId,
      remoteItems,
      (refs) =>
        addItemsToTraktList(
          ctx.accessToken,
          linkRow.traktListId,
          toTraktListBody(refs),
        ),
      (refs) =>
        removeItemsFromTraktList(
          ctx.accessToken,
          linkRow.traktListId,
          toTraktListBody(refs),
        ),
    );

    await upsertTraktListLink(ctx.db, {
      userConnectionId: ctx.connectionId,
      traktListId: linkRow.traktListId,
      traktListSlug: linkRow.traktListSlug,
      localListId: linkRow.localListId,
      remoteUpdatedAt: linkRow.remoteUpdatedAt,
      lastSyncedAt: ctx.now,
    });
  }
}

async function syncRatings(ctx: SyncContext): Promise<void> {
  const localRows = await ctx.db
    .select({
      mediaId: userRating.mediaId,
      rating: userRating.rating,
      updatedAt: userRating.updatedAt,
      type: media.type,
      provider: media.provider,
      externalId: media.externalId,
      imdbId: media.imdbId,
      tvdbId: media.tvdbId,
    })
    .from(userRating)
    .innerJoin(media, eq(userRating.mediaId, media.id))
    .where(
      and(
        eq(userRating.userId, ctx.userId),
        isNull(userRating.seasonId),
        isNull(userRating.episodeId),
        eq(userRating.isOverride, true),
      ),
    );

  const remoteRows = await listTraktRatings(ctx.accessToken, ctx.profileId);

  const localByKey = new Map<string, LocalRatingRef>();
  for (const local of localRows) {
    const mapped: LocalRatingRef = {
      mediaId: local.mediaId,
      type: local.type === "show" ? "show" : "movie",
      ids: mediaIdsFromRow(local),
      occurredAt: local.updatedAt,
      rating: local.rating,
    };
    const key = mediaRefKey(mapped.type, mapped.ids);
    if (!key) continue;
    localByKey.set(key, mapped);
  }

  const remoteByKey = new Map<string, TraktMediaRef>();
  for (const remote of remoteRows) {
    const key = mediaRefKey(remote.type, remote.ids);
    if (!key) continue;
    remoteByKey.set(key, remote);
  }

  const keys = new Set<string>([
    ...localByKey.keys(),
    ...remoteByKey.keys(),
  ]);

  const addRemote: Array<{ type: "movie" | "show"; ids: TraktIds; rating: number }> = [];
  const removeRemote: Array<{ type: "movie" | "show"; ids: TraktIds }> = [];
  const resolveCache = new Map<string, string | null>();

  for (const key of keys) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);

    if (local && remote) {
      if (local.rating === remote.rating) continue;

      const remoteAt = parseDateOrNow(remote.ratedAt, ctx.now);
      const useLocal = withinConflictWindow(local.occurredAt, remoteAt)
        ? local.occurredAt <= remoteAt
        : local.occurredAt > remoteAt;

      if (useLocal) {
        addRemote.push({
          type: local.type,
          ids: local.ids,
          rating: local.rating,
        });
      } else if (typeof remote.rating === "number") {
        await upsertUserRating(ctx.db, {
          userId: ctx.userId,
          mediaId: local.mediaId,
          seasonId: null,
          episodeId: null,
          rating: remote.rating,
          isOverride: true,
        });
        await upsertUserMediaState(ctx.db, {
          userId: ctx.userId,
          mediaId: local.mediaId,
          rating: remote.rating,
        });
      }
      continue;
    }

    if (local && !remote) {
      const keepPresence = decidePresenceAction(
        local.occurredAt,
        ctx.now,
        ctx.initialSync,
      );
      if (keepPresence === "keep-presence") {
        addRemote.push({
          type: local.type,
          ids: local.ids,
          rating: local.rating,
        });
      } else {
        await deleteUserRating(ctx.db, ctx.userId, local.mediaId, null, null);
        await upsertUserMediaState(ctx.db, {
          userId: ctx.userId,
          mediaId: local.mediaId,
          rating: null,
        });
      }
      continue;
    }

    if (!local && remote && typeof remote.rating === "number") {
      const remoteAt = parseDateOrNow(remote.ratedAt, ctx.now);
      const keepPresence = decidePresenceAction(
        remoteAt,
        ctx.now,
        ctx.initialSync,
      );
      const mediaId = await resolveMediaFromTraktRef(ctx.db, remote, resolveCache);
      if (!mediaId) continue;

      if (keepPresence === "keep-presence") {
        await upsertUserRating(ctx.db, {
          userId: ctx.userId,
          mediaId,
          seasonId: null,
          episodeId: null,
          rating: remote.rating,
          isOverride: true,
        });
        await upsertUserMediaState(ctx.db, {
          userId: ctx.userId,
          mediaId,
          rating: remote.rating,
        });
      } else {
        removeRemote.push({ type: remote.type, ids: remote.ids });
      }
    }
  }

  const dedupedAdds = dedupeByKey(addRemote);
  if (dedupedAdds.length > 0) {
    await addTraktRatings(ctx.accessToken, toTraktRatingsBody(dedupedAdds));
  }

  const dedupedRemovals = dedupeByKey(removeRemote);
  if (dedupedRemovals.length > 0) {
    await removeTraktRatings(ctx.accessToken, toTraktFavoritesBody(dedupedRemovals));
  }
}

async function syncFavorites(ctx: SyncContext): Promise<void> {
  const localRows = await ctx.db
    .select({
      mediaId: userMediaState.mediaId,
      updatedAt: userMediaState.updatedAt,
      type: media.type,
      provider: media.provider,
      externalId: media.externalId,
      imdbId: media.imdbId,
      tvdbId: media.tvdbId,
    })
    .from(userMediaState)
    .innerJoin(media, eq(userMediaState.mediaId, media.id))
    .where(
      and(
        eq(userMediaState.userId, ctx.userId),
        eq(userMediaState.isFavorite, true),
      ),
    );

  const remoteRows = await listTraktFavorites(ctx.accessToken, ctx.profileId);

  const localByKey = new Map<string, LocalMediaRef>();
  for (const local of localRows) {
    const mapped: LocalMediaRef = {
      mediaId: local.mediaId,
      type: local.type === "show" ? "show" : "movie",
      ids: mediaIdsFromRow(local),
      occurredAt: local.updatedAt,
    };
    const key = mediaRefKey(mapped.type, mapped.ids);
    if (!key) continue;
    localByKey.set(key, mapped);
  }

  const remoteByKey = new Map<string, TraktMediaRef>();
  for (const remote of remoteRows) {
    const key = mediaRefKey(remote.type, remote.ids);
    if (!key) continue;
    remoteByKey.set(key, remote);
  }

  const keys = new Set<string>([
    ...localByKey.keys(),
    ...remoteByKey.keys(),
  ]);

  const addRemote: Array<{ type: "movie" | "show"; ids: TraktIds }> = [];
  const removeRemote: Array<{ type: "movie" | "show"; ids: TraktIds }> = [];
  const resolveCache = new Map<string, string | null>();

  for (const key of keys) {
    const local = localByKey.get(key);
    const remote = remoteByKey.get(key);
    if (local && remote) continue;

    if (local && !remote) {
      const keepPresence = decidePresenceAction(
        local.occurredAt,
        ctx.now,
        ctx.initialSync,
      );
      if (keepPresence === "keep-presence") {
        addRemote.push({ type: local.type, ids: local.ids });
      } else {
        await upsertUserMediaState(ctx.db, {
          userId: ctx.userId,
          mediaId: local.mediaId,
          isFavorite: false,
        });
      }
      continue;
    }

    if (!local && remote) {
      const remoteAt = parseDateOrNow(remote.listedAt, ctx.now);
      const keepPresence = decidePresenceAction(
        remoteAt,
        ctx.now,
        ctx.initialSync,
      );
      const mediaId = await resolveMediaFromTraktRef(ctx.db, remote, resolveCache);
      if (!mediaId) continue;

      if (keepPresence === "keep-presence") {
        await upsertUserMediaState(ctx.db, {
          userId: ctx.userId,
          mediaId,
          isFavorite: true,
        });
      } else {
        removeRemote.push({ type: remote.type, ids: remote.ids });
      }
    }
  }

  const dedupedAdds = dedupeByKey(addRemote);
  if (dedupedAdds.length > 0) {
    await addTraktFavorites(ctx.accessToken, toTraktFavoritesBody(dedupedAdds));
  }

  const dedupedRemovals = dedupeByKey(removeRemote);
  if (dedupedRemovals.length > 0) {
    await removeTraktFavorites(
      ctx.accessToken,
      toTraktFavoritesBody(dedupedRemovals),
    );
  }
}

async function pullHistory(ctx: SyncContext): Promise<void> {
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

    const mediaId = await resolveMediaFromTraktRef(ctx.db, remote, resolveCache);
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
  }
}

async function pushHistory(ctx: SyncContext): Promise<void> {
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
        seasons: new Map<number, Array<{ number: number; watched_at: string }>>(),
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
        shows: [
          ...showNoEpisode,
          ...showsWithSeasons,
        ],
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

async function linkPulledHistoryBackfill(ctx: SyncContext): Promise<void> {
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
    const mediaId = await resolveMediaFromTraktRef(ctx.db, remote, resolveCache);
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

export async function syncTraktConnection(
  db: Database,
  connectionId: string,
): Promise<void> {
  const conn = await db.query.userConnection.findFirst({
    where: and(
      eq(userConnection.id, connectionId),
      eq(userConnection.provider, "trakt"),
      eq(userConnection.enabled, true),
    ),
  });
  if (!conn?.token || !conn.userId) return;

  const { accessToken } = await refreshTraktAccessTokenIfNeeded(db, conn);
  const syncState = await findTraktSyncStateByConnection(db, conn.id);
  const initialSync = !syncState?.lastActivityAt;
  const now = new Date();
  const profileId = conn.externalUserId ?? "me";

  const ctx: SyncContext = {
    db,
    userId: conn.userId,
    connectionId: conn.id,
    accessToken,
    profileId,
    initialSync,
    now,
  };

  await syncWatchlist(ctx);
  await syncCustomLists(ctx);
  await syncRatings(ctx);
  await syncFavorites(ctx);
  await pullHistory(ctx);
  await pushHistory(ctx);
  await linkPulledHistoryBackfill(ctx);

  await upsertTraktSyncState(db, conn.id, {
    lastPulledAt: now,
    lastPushedAt: now,
    lastActivityAt: now,
  });
}

export async function syncAllTraktConnections(db: Database): Promise<void> {
  const connections = await db.query.userConnection.findMany({
    where: and(
      eq(userConnection.provider, "trakt"),
      eq(userConnection.enabled, true),
      isNotNull(userConnection.token),
    ),
  });

  for (const connection of connections) {
    try {
      await syncTraktConnection(db, connection.id);
    } catch (err) {
      console.error(
        `[trakt-sync] Connection ${connection.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export async function syncUserTraktConnections(
  db: Database,
  userId: string,
): Promise<void> {
  const connections = await db.query.userConnection.findMany({
    where: and(
      eq(userConnection.userId, userId),
      eq(userConnection.provider, "trakt"),
      eq(userConnection.enabled, true),
      isNotNull(userConnection.token),
    ),
  });

  for (const connection of connections) {
    try {
      await syncTraktConnection(db, connection.id);
    } catch (err) {
      console.error(
        `[trakt-sync] User ${userId} connection ${connection.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
