import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { listItem, media } from "@canto/db/schema";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import type { TraktApiPort } from "@canto/core/domain/trakt/ports/trakt-api.port";
import type { TraktRepositoryPort } from "@canto/core/domain/trakt/ports/trakt-repository.port";
import type { UserConnectionRepositoryPort } from "@canto/core/domain/media-servers/ports/user-connection-repository.port";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type {
  TraktIds,
  TraktMediaRef,
} from "@canto/core/domain/trakt/types/trakt-api";
import { slugify } from "@canto/core/domain/shared/rules/slugify";
import { persistMediaUseCase } from "@canto/core/domain/media/use-cases/persist";

/**
 * @deprecated Used only by the legacy `decidePresenceAction` path that still
 * powers ratings/favorites sync. List membership now uses `reconcileListItem`
 * with positive signals.
 */
export const CONFLICT_WINDOW_MS = 10 * 60 * 1000;

/**
 * After a successful push, the remote may take a moment to surface the new
 * item via `listTraktListItems` (Trakt is eventually consistent). When a
 * sync immediately afterwards still sees `local && !remote`, we treat that
 * as in-flight rather than as evidence the remote deleted the item.
 */
export const PUSH_GRACE_MS = 5 * 60 * 1000;

export interface LocalMediaRef {
  mediaId: string;
  type: "movie" | "show";
  ids: TraktIds;
  occurredAt: Date;
  /** Set after a successful Trakt push. Only `reconcileListItem` reads it;
   *  legacy callers that still build `LocalMediaRef`s for ratings/favorites
   *  sync may leave it `undefined`. */
  lastPushedAt?: Date | null;
}

export interface LocalTombstone {
  mediaId: string;
  type: "movie" | "show";
  ids: TraktIds;
  deletedAt: Date;
}

export interface LocalRatingRef extends LocalMediaRef {
  rating: number;
}

/**
 * Bundle of every port the trakt sync use-cases consume. Each use-case
 * declares its own `Deps` view onto a subset of these so the call sites stay
 * honest about what they touch.
 *
 * Wave 9A wired the `media` port into trakt sync — `findByAnyReference` and
 * `findEpisodeIdByMediaAndNumbers` now flow through it instead of the
 * legacy infra helpers.
 */
export interface SyncDeps {
  traktApi: TraktApiPort;
  trakt: TraktRepositoryPort;
  userMedia: UserMediaRepositoryPort;
  userConnection: UserConnectionRepositoryPort;
  lists: ListsRepositoryPort;
  media: MediaRepositoryPort;
  providers: { tmdb: MediaProviderPort; tvdb: MediaProviderPort };
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

export interface ResolveMediaDeps {
  media: MediaRepositoryPort;
  providers: { tmdb: MediaProviderPort; tvdb: MediaProviderPort };
}

export interface SyncListMembershipDeps extends ResolveMediaDeps {
  lists: ListsRepositoryPort;
}

export async function resolveMediaFromTraktRef(
  db: Database,
  deps: ResolveMediaDeps,
  ref: TraktMediaRef,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const key = mediaRefKey(ref.type, ref.ids);
  if (!key) return null;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const byAnyReference = await deps.media.findByAnyReference(
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
      const persisted = await persistMediaUseCase(
        db,
        {
          externalId: ref.ids.tmdb,
          provider: "tmdb",
          type: ref.type,
        },
        deps.providers,
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
      const persisted = await persistMediaUseCase(
        db,
        {
          externalId: ref.ids.tvdb,
          provider: "tvdb",
          type: ref.type,
        },
        deps.providers,
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

/**
 * @deprecated Use {@link reconcileListItem}. Retained while ratings/favorites
 * sync still flows through `decidePresenceAction`; see the migration plan
 * for those modules. The 10-min window is unsafe for list membership because
 * a missed/late Trakt push silently casts the local row as "should be deleted".
 */
export function decidePresenceAction(
  occurredAt: Date,
  now: Date,
  initialSync: boolean,
): "keep-presence" | "keep-absence" {
  if (initialSync) return "keep-presence";
  if (withinConflictWindow(occurredAt, now)) return "keep-presence";
  return "keep-absence";
}

export type ReconcileAction =
  | { kind: "noop" }
  | { kind: "push-to-remote"; reason: "local-only" | "tombstone-pending" }
  | { kind: "remove-from-remote"; reason: "local-tombstone" }
  | { kind: "add-to-local"; reason: "remote-only" }
  | { kind: "soft-delete-local"; reason: "remote-deleted-after-push" }
  | { kind: "wait"; reason: "push-grace" | "ambiguous" };

export interface ReconcileInputs {
  local: LocalMediaRef | null;
  tombstone: LocalTombstone | null;
  remote: TraktMediaRef | null;
  now: Date;
  initialSync: boolean;
}

/**
 * Decide what to do with a single (list, media) pair given positive signals
 * on both sides. The previous implementation collapsed every "local without
 * remote" case into a 10-minute time window — that lost data whenever a push
 * was delayed, dropped, or eventually-consistent. This version asks instead:
 * "do we have proof the remote ever knew about this row?"
 *
 * - `local` (live) AND `remote` → no-op.
 * - `local` AND no `remote`:
 *     - never pushed → push.
 *     - pushed within {@link PUSH_GRACE_MS} → wait (Trakt may be lagging).
 *     - pushed long ago → remote really removed it → soft-delete local.
 * - no `local` AND `remote`:
 *     - tombstone exists for the same row → user removed it locally → push remove.
 *     - else → import (someone added on Trakt OR initial sync).
 * - tombstone but no live local AND no remote → user-removed and Trakt agrees → no-op.
 *
 * `initialSync` always biases toward `add-to-local` so the first sync after
 * connecting an account never destroys data.
 */
export function reconcileListItem(input: ReconcileInputs): ReconcileAction {
  const { local, tombstone, remote, now, initialSync } = input;

  if (local && remote) return { kind: "noop" };

  if (local && !remote) {
    if (!local.lastPushedAt) {
      return { kind: "push-to-remote", reason: "local-only" };
    }
    const sincePush = now.getTime() - local.lastPushedAt.getTime();
    if (sincePush < PUSH_GRACE_MS) {
      return { kind: "wait", reason: "push-grace" };
    }
    return { kind: "soft-delete-local", reason: "remote-deleted-after-push" };
  }

  if (!local && remote) {
    if (initialSync) return { kind: "add-to-local", reason: "remote-only" };
    if (tombstone) {
      const remoteAt = parseDateOrNow(remote.listedAt, now);
      // The user removed *after* the Trakt entry was added → push the remove.
      if (tombstone.deletedAt > remoteAt) {
        return { kind: "remove-from-remote", reason: "local-tombstone" };
      }
      // Trakt entry is newer than the tombstone → user re-added on Trakt.
      return { kind: "add-to-local", reason: "remote-only" };
    }
    return { kind: "add-to-local", reason: "remote-only" };
  }

  // Tombstone-only: nothing on the live side, nothing on Trakt — already in sync.
  return { kind: "noop" };
}

export interface LoadLocalListRefsResult {
  live: LocalMediaRef[];
  tombstones: LocalTombstone[];
}

export async function loadLocalListRefs(
  db: Database,
  listId: string,
): Promise<LoadLocalListRefsResult> {
  const rows = await db
    .select({
      mediaId: listItem.mediaId,
      addedAt: listItem.addedAt,
      lastPushedAt: listItem.lastPushedAt,
      deletedAt: listItem.deletedAt,
      type: media.type,
      provider: media.provider,
      externalId: media.externalId,
      imdbId: media.imdbId,
      tvdbId: media.tvdbId,
    })
    .from(listItem)
    .innerJoin(media, eq(listItem.mediaId, media.id))
    .where(eq(listItem.listId, listId));

  const live: LocalMediaRef[] = [];
  const tombstones: LocalTombstone[] = [];

  for (const row of rows) {
    if (row.type !== "movie" && row.type !== "show") continue;
    const ids = mediaIdsFromRow(row);
    if (!mediaRefKey(row.type, ids)) continue;

    if (row.deletedAt) {
      tombstones.push({
        mediaId: row.mediaId,
        type: row.type,
        ids,
        deletedAt: row.deletedAt,
      });
    } else {
      live.push({
        mediaId: row.mediaId,
        type: row.type,
        ids,
        occurredAt: row.addedAt,
        lastPushedAt: row.lastPushedAt ?? null,
      });
    }
  }

  return { live, tombstones };
}

/** Structured log of a single reconciliation outcome. Lets us reconstruct
 *  every sync-driven mutation after the fact — the missing tool that made
 *  the recent data-loss incident impossible to forensically investigate. */
function logSyncDecision(
  listId: string,
  decision: ReconcileAction,
  ctx: { local: LocalMediaRef | null; remote: TraktMediaRef | null; now: Date },
): void {
  if (decision.kind === "noop" || decision.kind === "wait") return;
  const localPart = ctx.local
    ? `local.mediaId=${ctx.local.mediaId} local.lastPushedAt=${ctx.local.lastPushedAt?.toISOString() ?? "null"}`
    : "local=null";
  const remotePart = ctx.remote
    ? `remote.listedAt=${ctx.remote.listedAt}`
    : "remote=null";
  console.log(
    `[trakt-sync] list=${listId} action=${decision.kind} reason=${decision.reason} ${localPart} ${remotePart} now=${ctx.now.toISOString()}`,
  );
}

export async function syncSingleListMembership(
  ctx: SyncContext,
  deps: SyncListMembershipDeps,
  localListId: string,
  remoteRefs: TraktMediaRef[],
  pushToRemote: (
    refs: Array<{ type: "movie" | "show"; ids: TraktIds }>,
  ) => Promise<void>,
  removeFromRemote: (
    refs: Array<{ type: "movie" | "show"; ids: TraktIds }>,
  ) => Promise<void>,
): Promise<void> {
  const { live, tombstones } = await loadLocalListRefs(ctx.db, localListId);

  const liveByKey = new Map<string, LocalMediaRef>();
  for (const local of live) {
    const key = mediaRefKey(local.type, local.ids);
    if (key) liveByKey.set(key, local);
  }

  const tombstoneByKey = new Map<string, LocalTombstone>();
  for (const tomb of tombstones) {
    const key = mediaRefKey(tomb.type, tomb.ids);
    // If both a live row and a tombstone exist (re-added after removal),
    // the live row wins for reconcile — the tombstone is historical only.
    if (key && !liveByKey.has(key)) tombstoneByKey.set(key, tomb);
  }

  const remoteByKey = new Map<string, TraktMediaRef>();
  for (const remote of remoteRefs) {
    const key = mediaRefKey(remote.type, remote.ids);
    if (key) remoteByKey.set(key, remote);
  }

  const keys = new Set<string>([
    ...liveByKey.keys(),
    ...tombstoneByKey.keys(),
    ...remoteByKey.keys(),
  ]);

  // We carry `addedAt` along with each mediaId so the eventual `addListItem`
  // call stamps the listItem row with Trakt's real `listed_at` timestamp
  // instead of `now()`. This keeps the library "added on" sort honest after
  // an initial Trakt backfill — without it, every imported item would be
  // grouped on the date of the sync.
  const addLocalEntries: Array<{ mediaId: string; addedAt: Date }> = [];
  const removeLocalMediaIds: string[] = [];
  const addRemoteRefs: Array<{ type: "movie" | "show"; ids: TraktIds; mediaId: string }> = [];
  const removeRemoteRefs: Array<{ type: "movie" | "show"; ids: TraktIds }> = [];

  const resolveCache = new Map<string, string | null>();

  for (const key of keys) {
    const local = liveByKey.get(key) ?? null;
    const tombstone = tombstoneByKey.get(key) ?? null;
    const remote = remoteByKey.get(key) ?? null;

    const decision = reconcileListItem({
      local,
      tombstone,
      remote,
      now: ctx.now,
      initialSync: ctx.initialSync,
    });

    logSyncDecision(localListId, decision, { local, remote, now: ctx.now });

    switch (decision.kind) {
      case "noop":
      case "wait":
        continue;
      case "push-to-remote":
        if (local) {
          addRemoteRefs.push({ type: local.type, ids: local.ids, mediaId: local.mediaId });
        }
        continue;
      case "soft-delete-local":
        if (local) removeLocalMediaIds.push(local.mediaId);
        continue;
      case "remove-from-remote":
        if (remote) {
          removeRemoteRefs.push({ type: remote.type, ids: remote.ids });
        }
        continue;
      case "add-to-local": {
        if (!remote) continue;
        const mediaId = await resolveMediaFromTraktRef(
          ctx.db,
          deps,
          remote,
          resolveCache,
        );
        if (mediaId) {
          addLocalEntries.push({
            mediaId,
            addedAt: parseDateOrNow(remote.listedAt, ctx.now),
          });
        }
        continue;
      }
    }
  }

  // Collapse duplicate mediaIds that may surface across different remote
  // representations — keep the earliest listedAt so the library lists the
  // item under the original day the user added it on Trakt.
  const earliestByMediaId = new Map<string, Date>();
  for (const entry of addLocalEntries) {
    const prev = earliestByMediaId.get(entry.mediaId);
    if (!prev || entry.addedAt.getTime() < prev.getTime()) {
      earliestByMediaId.set(entry.mediaId, entry.addedAt);
    }
  }
  const uniqueRemoveLocal = [...new Set(removeLocalMediaIds)];

  for (const [mediaId, addedAt] of earliestByMediaId) {
    await deps.lists.addItem({ listId: localListId, mediaId, addedAt });
  }

  for (const mediaId of uniqueRemoveLocal) {
    await deps.lists.removeItem(localListId, mediaId, "trakt-sync");
  }

  const dedupedRemoteAdds = dedupeByKey(addRemoteRefs);
  const dedupedRemoteRemoves = dedupeByKey(removeRemoteRefs);

  if (dedupedRemoteAdds.length > 0) {
    await pushToRemote(
      dedupedRemoteAdds.map(({ type, ids }) => ({ type, ids })),
    );
    // Mark `last_pushed_at` *after* the API returns 2xx — this is the positive
    // signal `reconcileListItem` uses to distinguish "never reached Trakt"
    // from "reached Trakt and was later removed there".
    await deps.lists.markItemsPushed(
      localListId,
      dedupedRemoteAdds.map((r) => r.mediaId),
      ctx.now,
    );
  }
  if (dedupedRemoteRemoves.length > 0) {
    await removeFromRemote(dedupedRemoteRemoves);
  }
}

export async function findOrCreateUniqueListSlug(
  lists: ListsRepositoryPort,
  userId: string,
  baseSlug: string,
): Promise<string> {
  const normalized = slugify(baseSlug) || "trakt-list";
  let candidate = normalized;
  let i = 1;

  while (true) {
    const existing = await lists.findBySlug(candidate, userId);
    if (!existing) return candidate;
    i += 1;
    candidate = `${normalized}-${i}`;
  }
}
