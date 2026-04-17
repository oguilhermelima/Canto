import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { list, listItem, media } from "@canto/db/schema";
import {
  addListItem,
  findMediaByAnyReference,
  removeListItem,
} from "../../../infrastructure/repositories";
import type {
  TraktIds,
  TraktMediaRef,
} from "../../../infrastructure/adapters/trakt";
import { getTmdbProvider } from "../../../lib/tmdb-client";
import { getTvdbProvider } from "../../../lib/tvdb-client";
import { slugify } from "../../rules/slugify";
import { persistMediaUseCase } from "../persist-media";

export const CONFLICT_WINDOW_MS = 10 * 60 * 1000;

export interface LocalMediaRef {
  mediaId: string;
  type: "movie" | "show";
  ids: TraktIds;
  occurredAt: Date;
}

export interface LocalRatingRef extends LocalMediaRef {
  rating: number;
}

export interface SyncContext {
  db: Database;
  userId: string;
  connectionId: string;
  accessToken: string;
  profileId: string;
  initialSync: boolean;
  now: Date;
}

export function mediaRefKey(
  type: "movie" | "show",
  ids: TraktIds,
): string | null {
  if (typeof ids.tmdb === "number") return `${type}:tmdb:${ids.tmdb}`;
  if (typeof ids.imdb === "string" && ids.imdb.length > 0) {
    return `${type}:imdb:${ids.imdb}`;
  }
  if (typeof ids.tvdb === "number") return `${type}:tvdb:${ids.tvdb}`;
  if (typeof ids.trakt === "number") return `${type}:trakt:${ids.trakt}`;
  return null;
}

export function mediaIdsFromRow(row: {
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

export function withinConflictWindow(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= CONFLICT_WINDOW_MS;
}

export function parseDateOrNow(value: string | undefined, now: Date): Date {
  if (!value) return now;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return now;
  return parsed;
}

export function dedupeByKey<
  T extends { type: "movie" | "show"; ids: TraktIds },
>(refs: T[]): T[] {
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

export function toTraktListBody(
  refs: Array<{ type: "movie" | "show"; ids: TraktIds; watchedAt?: string }>,
) {
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

export function toTraktFavoritesBody(
  refs: Array<{ type: "movie" | "show"; ids: TraktIds }>,
) {
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

export function toTraktRatingsBody(
  refs: Array<{ type: "movie" | "show"; ids: TraktIds; rating: number }>,
) {
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

export async function resolveMediaFromTraktRef(
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
      const [tmdb, tvdb] = await Promise.all([
        getTmdbProvider(),
        getTvdbProvider(),
      ]);
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
      const [tmdb, tvdb] = await Promise.all([
        getTmdbProvider(),
        getTvdbProvider(),
      ]);
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

export function decidePresenceAction(
  occurredAt: Date,
  now: Date,
  initialSync: boolean,
): "keep-presence" | "keep-absence" {
  if (initialSync) return "keep-presence";
  if (withinConflictWindow(occurredAt, now)) return "keep-presence";
  return "keep-absence";
}

export async function loadLocalListRefs(
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

  return rows.flatMap((row): LocalMediaRef[] => {
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

export async function syncSingleListMembership(
  ctx: SyncContext,
  localListId: string,
  remoteRefs: TraktMediaRef[],
  pushToRemote: (
    refs: Array<{ type: "movie" | "show"; ids: TraktIds }>,
  ) => Promise<void>,
  removeFromRemote: (
    refs: Array<{ type: "movie" | "show"; ids: TraktIds }>,
  ) => Promise<void>,
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

  const keys = new Set<string>([...localByKey.keys(), ...remoteByKey.keys()]);

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
      const action = decidePresenceAction(
        local.occurredAt,
        ctx.now,
        ctx.initialSync,
      );
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
      const mediaId = await resolveMediaFromTraktRef(
        ctx.db,
        remote,
        resolveCache,
      );
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

export async function findOrCreateUniqueListSlug(
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
