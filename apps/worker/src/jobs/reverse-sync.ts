/* -------------------------------------------------------------------------- */
/*  Reverse sync job                                                          */
/*                                                                            */
/*  Walks every enabled user connection, scans their Plex/Jellyfin            */
/*  libraries, updates per-user playback state and library membership, then  */
/*  hands the still-unknown-to-us items to the sync pipeline for media       */
/*  resolution and media_version upserts.                                    */
/* -------------------------------------------------------------------------- */

import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { runWithConcurrency } from "@canto/core/platform/concurrency/run-with-concurrency";
import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";
import { jobDispatcher } from "@canto/core/platform/queue/job-dispatcher.adapter";
import { makeJellyfinAdapter } from "@canto/core/infra/media-servers/jellyfin.adapter-bindings";
import { makePlexAdapter } from "@canto/core/infra/media-servers/plex.adapter-bindings";
import { makeMediaServerPush } from "@canto/core/infra/media-servers/media-server-push.adapter";
import { makeMediaVersionRepository } from "@canto/core/infra/media/media-version-repository.adapter";
import { makeMediaAspectStateRepository } from "@canto/core/infra/media/media-aspect-state-repository.adapter";
import { makeListsRepository } from "@canto/core/infra/lists/lists-repository.adapter";
import { makeServerCredentials } from "@canto/core/infra/media-servers/server-credentials.adapter";
import type { MediaVersionRow } from "@canto/core/infra/media/media-version-repository";
import {
  findEnabledSyncLinks,
  updateServerLinksBatch,
} from "@canto/core/infra/file-organization/folder-repository";
import {
  findAllUserConnections,
  clearUserConnectionStale,
  markUserConnectionStale,
} from "@canto/core/infra/media-servers/user-connection-repository";
import {
  addToUserMediaLibrary,
  pruneStaleUserMediaLibrary,
} from "@canto/core/infra/user-media/library-repository";
import { upsertUserPlaybackProgress } from "@canto/core/infra/user-media/playback-progress-repository";
import {
  pruneStaleMediaVersions,
  touchMediaVersionsSeen,
} from "@canto/core/infra/media/media-version-repository";
import { reconcileMediaInLibrary } from "@canto/core/infra/media/media-repository";
import { makeUserMediaRepository } from "@canto/core/infra/user-media/user-media-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makePersistDeps } from "@canto/core/composition/persist-deps";
import { promoteUserMediaStateFromPlayback } from "@canto/core/domain/user-media/use-cases/promote-user-media-state-from-playback";
import {
  scanJellyfinLibraries,
  scanPlexLibraries,
  runSyncPipeline,
  SyncAuthError,
} from "@canto/core/domain/sync";
import type {
  JellyfinLibraryRef,
  PlexLibraryRef,
  ScannedMediaItem,
  ServerSource,
} from "@canto/core/domain/sync";
import {
  batchResolveEpisodesByMediaAndNumbers,
  batchResolveMediaByExternalRefs,
  batchResolveMediaVersionsByServerItemIds,
  findEpisodeIdInMap,
  findMediaInRefs,
} from "@canto/core/infra/sync/batch-resolvers";

const SKIP_RECENTLY_SYNCED_MS = 6 * 60 * 60 * 1000; // 6 hours

function isSyncProvider(value: string): value is ServerSource {
  return value === "jellyfin" || value === "plex";
}

/* -------------------------------------------------------------------------- */
/*  Scanner dispatch                                                           */
/* -------------------------------------------------------------------------- */

interface LibraryDescriptor {
  id: string;
  type: string;
  linkId: string;
  sinceMs?: number;
}

async function scanForConnection(
  provider: ServerSource,
  token: string,
  libs: LibraryDescriptor[],
  externalUserId: string | undefined,
): Promise<ScannedMediaItem[]> {
  if (provider === "jellyfin") {
    const jellyfinUrl = await getSetting("jellyfin.url");
    if (!jellyfinUrl) return [];
    const refs: JellyfinLibraryRef[] = libs.map((l) => ({
      jellyfinLibraryId: l.id,
      type: l.type,
      linkId: l.linkId,
      sinceMs: l.sinceMs,
    }));
    return scanJellyfinLibraries(jellyfinUrl, token, refs, externalUserId);
  }

  const plexUrl = await getSetting("plex.url");
  if (!plexUrl) return [];
  const refs: PlexLibraryRef[] = libs.map((l) => ({
    plexLibraryId: l.id,
    type: l.type,
    linkId: l.linkId,
    sinceMs: l.sinceMs,
  }));
  return scanPlexLibraries(plexUrl, token, refs);
}

/* -------------------------------------------------------------------------- */
/*  Per-user phase: playback progress + library membership                    */
/* -------------------------------------------------------------------------- */

interface PlaybackSyncResult {
  /** Media rows whose playback state was upserted this cycle. */
  touchedMediaIds: Set<string>;
  /**
   * Full media_version map for every scanned serverItemId. Returned so the
   * downstream `filterItemsNeedingGlobalSync` can re-use the lookup instead
   * of re-issuing N per-item queries.
   */
  versionMap: Map<string, MediaVersionRow>;
}

async function syncUserPlaybackAndLibrary(
  userId: string,
  provider: ServerSource,
  items: ScannedMediaItem[],
  syncRunStart: Date,
  allowPrune: boolean,
): Promise<PlaybackSyncResult> {
  const touchedMediaIds = new Set<string>();

  // Two batch lookups in parallel: media-by-external-refs (for anchor
  // resolution) and media_version-by-serverItemId (covers items without
  // external ids and feeds the recently-synced filter downstream). Each
  // hits a different index, so they can run concurrently.
  const [refMaps, versionMap] = await Promise.all([
    batchResolveMediaByExternalRefs(
      db,
      items.map((i) => ({
        tmdbId: i.externalIds.tmdb,
        imdbId: i.externalIds.imdb,
        tvdbId: i.externalIds.tvdb,
      })),
    ),
    batchResolveMediaVersionsByServerItemIds(
      db,
      provider,
      items.map((i) => i.serverItemId),
    ),
  ]);

  // Resolve each item against (refs → version) in priority order, caching
  // the result so the per-item loop and the show-mediaId aggregation below
  // both hit memory only.
  const refResolved = new Map<string, { id: string; type: string } | null>();
  for (const item of items) {
    const row = findMediaInRefs(refMaps, {
      tmdbId: item.externalIds.tmdb,
      imdbId: item.externalIds.imdb,
      tvdbId: item.externalIds.tvdb,
    });
    if (row) {
      refResolved.set(item.serverItemId, { id: row.id, type: row.type });
      continue;
    }
    refResolved.set(item.serverItemId, null);
  }

  // Episodes: fan-in by mediaId. Episode lookup is needed only for show
  // items with valid (season, episode) numbers. Mirrors the per-item gate
  // below — `resolvedType` falls back to `item.type` when ref-resolution
  // missed, so a movie item with stray season/episode numbers (rare) is
  // excluded.
  const showMediaIds = new Set<string>();
  for (const item of items) {
    if (!Number.isInteger(item.playback.seasonNumber)) continue;
    if (!Number.isInteger(item.playback.episodeNumber)) continue;
    if ((item.playback.seasonNumber ?? -1) < 0) continue;
    if ((item.playback.episodeNumber ?? -1) < 0) continue;
    const anchor = refResolved.get(item.serverItemId);
    const resolvedType = anchor?.type ?? item.type;
    if (resolvedType !== "show") continue;
    const mediaId =
      anchor?.id ?? versionMap.get(item.serverItemId)?.mediaId ?? null;
    if (!mediaId) continue;
    showMediaIds.add(mediaId);
  }
  const episodeMap = await batchResolveEpisodesByMediaAndNumbers(db, [
    ...showMediaIds,
  ]);

  for (const item of items) {
    const anchor = refResolved.get(item.serverItemId);
    let mediaId: string | null = anchor?.id ?? null;
    if (!mediaId) {
      const v = versionMap.get(item.serverItemId);
      if (v?.mediaId) mediaId = v.mediaId;
    }

    if (mediaId) {
      await addToUserMediaLibrary(db, {
        userId,
        mediaId,
        source: provider,
        serverLinkId: item.serverLinkId,
        serverItemId: item.serverItemId,
      });
    }

    const hasPlayback =
      (item.playback.positionSeconds ?? 0) > 0 || item.playback.played;
    if (!hasPlayback || !mediaId) continue;

    const resolvedType = anchor?.type ?? item.type;
    let episodeId: string | undefined;
    if (
      resolvedType === "show" &&
      Number.isInteger(item.playback.seasonNumber) &&
      Number.isInteger(item.playback.episodeNumber) &&
      (item.playback.seasonNumber ?? -1) >= 0 &&
      (item.playback.episodeNumber ?? -1) >= 0
    ) {
      const found = findEpisodeIdInMap(
        episodeMap,
        mediaId,
        item.playback.seasonNumber ?? 0,
        item.playback.episodeNumber ?? 0,
      );
      if (found) episodeId = found;
    }

    const newPosition = item.playback.positionSeconds ?? 0;
    const newCompleted = item.playback.played;

    // Echo guard: if the new observation is within 5s of the stored value
    // AND the completion flag hasn't flipped, the position change is almost
    // certainly a round-trip of a push we already made to this server on a
    // previous cycle. We still upsert (so lastWatchedAt/source refresh) but
    // skip the fan-out to prevent infinite ping-pong between servers.
    //
    // `upsertUserPlaybackProgress` already does the find-then-update internally;
    // it now also returns the pre-update snapshot (or null for new/tombstoned
    // rows) so the echo guard can be evaluated without a second round-trip.
    const { previous } = await upsertUserPlaybackProgress(db, {
      userId,
      mediaId,
      episodeId,
      positionSeconds: newPosition,
      isCompleted: newCompleted,
      lastWatchedAt: item.playback.lastPlayedAt ?? new Date(),
      source: provider,
    });
    touchedMediaIds.add(mediaId);

    const positionDelta = previous
      ? Math.abs(newPosition - (previous.positionSeconds ?? 0))
      : Number.POSITIVE_INFINITY;
    const completionChanged = previous
      ? previous.isCompleted !== newCompleted
      : true;
    const shouldPush =
      !previous || positionDelta > 5 || completionChanged;

    if (shouldPush) {
      // Fire-and-forget; the use case swallows per-server errors so one bad
      // server never stalls the sync loop.
      void makeMediaServerPush(db).pushPlaybackPosition(
        userId,
        mediaId,
        episodeId ?? null,
        newPosition,
        newCompleted,
        provider,
      ).catch((err) => {
        console.error(
          `[reverse-sync] pushPlaybackPositionToServers failed for user ${userId} media ${mediaId}${episodeId ? ` episode ${episodeId}` : ""} (source: ${provider}, pos: ${newPosition}s, completed: ${newCompleted}):`,
          err instanceof Error ? err.message : err,
        );
      });
    }
  }

  // Only safe to prune when every enabled link for this user+provider was
  // full-scanned this cycle. A delta run only sees items modified since the
  // checkpoint, so pruning by `lastSyncedAt < syncRunStart` would nuke every
  // unchanged row.
  if (allowPrune) {
    try {
      const pruned = await pruneStaleUserMediaLibrary(db, userId, provider, syncRunStart);
      if (pruned > 0) {
        console.log(
          `[reverse-sync] Pruned ${pruned} stale ${provider} library entries for user ${userId}`,
        );
      }
    } catch (err) {
      console.error(`[reverse-sync] Failed to prune stale library entries:`, err);
    }
  }

  return { touchedMediaIds, versionMap };
}

/* -------------------------------------------------------------------------- */
/*  Global phase: filter items we've already imported recently                */
/* -------------------------------------------------------------------------- */

/**
 * Memory-only filter: skip items whose library was already globally synced
 * this run, and items whose existing media_version row was imported/skipped
 * within the last 6 hours. The `versionMap` argument carries the pre-loaded
 * media_version rows from `syncUserPlaybackAndLibrary` — no DB calls here.
 */
function filterItemsNeedingGlobalSync(
  provider: ServerSource,
  items: ScannedMediaItem[],
  alreadySynced: Set<string>,
  versionMap: Map<string, MediaVersionRow>,
): ScannedMediaItem[] {
  const skipCutoff = new Date(Date.now() - SKIP_RECENTLY_SYNCED_MS);
  const out: ScannedMediaItem[] = [];

  for (const item of items) {
    const libKey = `${provider}:${item.serverLinkId}`;
    if (alreadySynced.has(libKey)) continue;

    const existing = versionMap.get(item.serverItemId);
    if (
      existing?.mediaId &&
      new Date(existing.syncedAt) > skipCutoff &&
      (existing.result === "imported" || existing.result === "skipped")
    ) {
      continue;
    }

    out.push(item);
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  Main handler                                                               */
/* -------------------------------------------------------------------------- */

export interface ReverseSyncOptions {
  /**
   * Ignore per-link `lastSyncedAt` checkpoints and scan every library in
   * full. Full runs also re-enable stale-row pruning (deletion detection),
   * which delta runs must skip to avoid nuking unchanged items.
   */
  force?: boolean;
  /**
   * Restrict the run to a single user. Used by on-demand syncs dispatched
   * from the web app (e.g. app-focus trigger) so we don't loop every user
   * every time one person opens the app.
   */
  userId?: string;
  /**
   * Restrict the run to a single provider. The per-provider cron handlers
   * (jellyfin/plex) pass this so each scheduled run only walks its own
   * connections — without it both crons would loop every connection on
   * every fire, doubling the per-cycle cost.
   */
  provider?: ServerSource;
}

export async function runReverseSync(options: ReverseSyncOptions = {}): Promise<void> {
  const force = options.force === true;
  const allConnections = await findAllUserConnections(db);
  const connections = allConnections.filter((c) => {
    if (options.userId && c.userId !== options.userId) return false;
    if (options.provider && c.provider !== options.provider) return false;
    return true;
  });
  const tmdb = await getTmdbProvider();

  const globallySyncedLibraries = new Set<string>();

  for (const conn of connections) {
    if (!conn.token) continue;
    if (!isSyncProvider(conn.provider)) continue;
    const provider = conn.provider;

    console.log(`[reverse-sync] Processing connection for user ${conn.userId} (${provider})`);

    // Reverse-sync is strictly per-user: only links owned by this user's
    // connection count. Admin-level global folderServerLink rows (created
    // during server cadastro / onboarding) are intentionally ignored here
    // — they serve the admin catalog and post-download scan triggers, not
    // playback state sync.
    const syncLinks = await findEnabledSyncLinks(db, conn.id, provider);
    if (syncLinks.length === 0) {
      console.warn(
        `[reverse-sync] ${provider} connection for user ${conn.userId} has no per-user sync links; skipping. The user may need to re-authenticate to rediscover libraries.`,
      );
      continue;
    }

    const libs: LibraryDescriptor[] = syncLinks.map((l) => ({
      id: l.serverLibraryId,
      type: l.contentType ?? "mixed",
      linkId: l.id,
      sinceMs:
        force || !l.lastSyncedAt ? undefined : l.lastSyncedAt.getTime(),
    }));
    if (libs.length === 0) continue;

    // A link is "full-scanned" this cycle when it has no checkpoint filter.
    // Only these links' rows are safe to touch with prune logic below.
    const fullScanLinkIds = new Set(
      libs.filter((l) => l.sinceMs === undefined).map((l) => l.linkId),
    );
    const allLinksFullScan = fullScanLinkIds.size === libs.length;
    const deltaLinkCount = libs.length - fullScanLinkIds.size;
    if (deltaLinkCount > 0) {
      console.warn(
        `[reverse-sync] ${provider} user ${conn.userId}: ${deltaLinkCount}/${libs.length} link(s) using delta checkpoint`,
      );
    }

    if (provider === "jellyfin" && !conn.externalUserId) {
      console.warn(
        `[reverse-sync] Jellyfin connection for user ${conn.userId} is missing externalUserId; user playback metadata may be incomplete.`,
      );
    }

    let items: ScannedMediaItem[];
    try {
      items = await scanForConnection(
        provider,
        conn.token,
        libs,
        conn.externalUserId ?? undefined,
      );
    } catch (err) {
      console.error(
        `[reverse-sync] ${provider} scan failed for user ${conn.userId}:`,
        err instanceof Error ? err.message : err,
      );
      if (err instanceof SyncAuthError) {
        try {
          await markUserConnectionStale(
            db,
            conn.id,
            "Authentication failed — token may be expired",
          );
        } catch (markErr) {
          console.error(
            `[reverse-sync] Failed to mark connection ${conn.id} stale:`,
            markErr instanceof Error ? markErr.message : markErr,
          );
        }
      }
      continue;
    }

    // Scan completed — if this connection was previously flagged stale,
    // clear it now that we know its token still works.
    try {
      await clearUserConnectionStale(db, conn.id);
    } catch (err) {
      console.error(
        `[reverse-sync] Failed to clear stale flag for connection ${conn.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
    if (items.length === 0) {
      // Warm delta runs legitimately return 0 items when nothing changed
      // since the checkpoint. Bump every link's checkpoint so the next run
      // starts from "now" instead of widening the delta window forever.
      try {
        await updateServerLinksBatch(
          db,
          libs.map((l) => l.linkId),
          { lastSyncedAt: new Date() },
        );
      } catch (err) {
        console.error(
          `[reverse-sync] Failed to update lastSyncedAt for ${libs.length} link(s):`,
          err instanceof Error ? err.message : err,
        );
      }
      if (force || allLinksFullScan) {
        console.warn(
          `[reverse-sync] ${provider} full scan for user ${conn.userId} returned 0 items`,
        );
      }
      continue;
    }

    const syncRunStart = new Date();
    const { touchedMediaIds, versionMap } = await syncUserPlaybackAndLibrary(
      conn.userId,
      provider,
      items,
      syncRunStart,
      allLinksFullScan,
    );

    // Independent calls — fan out with bounded concurrency so a user with
    // 1000 watched items doesn't issue 1000 sequential awaits.
    const userMediaRepo = makeUserMediaRepository(db);
    const mediaRepo = makeMediaRepository(db);
    await runWithConcurrency(
      [...touchedMediaIds],
      10,
      (mediaId) =>
        promoteUserMediaStateFromPlayback({ repo: userMediaRepo, mediaRepo }, {
          userId: conn.userId,
          mediaId,
        }),
    );

    const scannedLinkIds = [...new Set(items.map((i) => i.serverLinkId))];

    const needGlobalSync = filterItemsNeedingGlobalSync(
      provider,
      items,
      globallySyncedLibraries,
      versionMap,
    );

    // Items the TMDB rate-limit filter dropped were still observed this
    // cycle. Bump their syncedAt so the stale-row prune below (which uses
    // syncRunStart as its cutoff) does not nuke them.
    const pipelineIds = new Set(needGlobalSync.map((i) => i.serverItemId));
    const filteredOutIds = items
      .map((i) => i.serverItemId)
      .filter((id) => !pipelineIds.has(id));
    if (filteredOutIds.length > 0) {
      try {
        await touchMediaVersionsSeen(db, provider, filteredOutIds, syncRunStart);
      } catch (err) {
        console.error(
          `[reverse-sync] Failed to touch filter-dropped media_version rows for ${provider}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (needGlobalSync.length > 0) {
      console.log(
        `[reverse-sync] Syncing ${needGlobalSync.length} new items for global library from user ${conn.userId}`,
      );
      try {
        await runSyncPipeline(
          db,
          tmdb,
          {
            logger: makeConsoleLogger(),
            dispatcher: jobDispatcher,
            jellyfin: makeJellyfinAdapter(),
            plex: makePlexAdapter(),
            media: makeMediaRepository(db),
            mediaVersions: makeMediaVersionRepository(db),
            mediaAspectState: makeMediaAspectStateRepository(db),
            lists: makeListsRepository(db),
            userMedia: makeUserMediaRepository(db),
            credentials: makeServerCredentials(),
            persist: makePersistDeps(db),
          },
          needGlobalSync,
          `${provider}-sync`,
          { forUserId: conn.userId },
        );
      } catch (err) {
        console.error(
          `[reverse-sync] runSyncPipeline failed for ${provider} (user ${conn.userId}):`,
          err instanceof Error ? err.message : err,
          err instanceof Error ? err.stack : "",
        );
      }
    }

    // Prune rows on full-scan links only. Delta scans return a subset of the
    // library so `lastSyncedAt < syncRunStart` cannot distinguish "deleted"
    // from "unchanged" for those links — deletion detection on delta links
    // is handled by the separate daily full run (`reverse-sync-full`).
    const fullScanScannedLinkIds = scannedLinkIds.filter((id) =>
      fullScanLinkIds.has(id),
    );
    if (fullScanScannedLinkIds.length > 0) {
      try {
        await pruneStaleMediaVersions(
          db,
          provider,
          fullScanScannedLinkIds,
          syncRunStart,
        );
      } catch (err) {
        console.error(
          `[reverse-sync] Failed to prune stale media_version rows for ${provider}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Bump every attempted link's checkpoint — including ones that returned
    // zero delta items — so warm runs don't keep widening the delta window
    // indefinitely for quiet libraries.
    try {
      await updateServerLinksBatch(
        db,
        libs.map((l) => l.linkId),
        { lastSyncedAt: new Date() },
      );
    } catch (err) {
      console.error(
        `[reverse-sync] Failed to update lastSyncedAt for ${libs.length} link(s):`,
        err instanceof Error ? err.message : err,
      );
    }

    for (const item of needGlobalSync) {
      globallySyncedLibraries.add(`${provider}:${item.serverLinkId}`);
    }
  }

  // Final reconciliation: any media still flagged `in_library = true` but no
  // longer anchored by a media_version (and not downloaded locally) should
  // flip back to false. Runs once after the outer per-connection loop.
  try {
    const affected = await reconcileMediaInLibrary(db);
    console.log(
      `[reverse-sync] reconcile flipped ${affected} media rows to in_library=false`,
    );
  } catch (err) {
    console.error(
      `[reverse-sync] Failed to reconcile media.in_library:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Legacy entry points                                                        */
/* -------------------------------------------------------------------------- */

export async function handleJellyfinSync(): Promise<void> {
  return runReverseSync({ provider: "jellyfin" });
}

export async function handlePlexSync(): Promise<void> {
  return runReverseSync({ provider: "plex" });
}

export async function handleReverseSyncFull(): Promise<void> {
  return runReverseSync({ force: true });
}

export async function handleReverseSyncUser(userId: string): Promise<void> {
  return runReverseSync({ userId });
}
