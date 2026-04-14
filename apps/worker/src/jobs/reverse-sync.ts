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
import { TmdbProvider } from "@canto/providers";
import {
  findEnabledSyncLinks,
  findAllUserConnections,
  findEpisodeIdByMediaAndNumbers,
  findMediaByAnyReference,
  findMediaVersionBySourceAndServerItemId,
  findUserPlaybackProgress,
  upsertUserPlaybackProgress,
  addToUserMediaLibrary,
  pruneStaleUserMediaLibrary,
  pruneStaleMediaVersions,
  touchMediaVersionsSeen,
  reconcileMediaInLibrary,
  updateServerLink,
  markUserConnectionStale,
  clearUserConnectionStale,
} from "@canto/core/infrastructure/repositories";
import { promoteUserMediaStateFromPlayback } from "@canto/core/domain/use-cases/promote-user-media-state-from-playback";
import { pushPlaybackPositionToServers } from "@canto/core/domain/use-cases/push-playback-position";
import {
  scanJellyfinLibraries,
  scanPlexLibraries,
  runSyncPipeline,
  SyncAuthError,
  type JellyfinLibraryRef,
  type PlexLibraryRef,
  type ScannedMediaItem,
  type ServerSource,
} from "@canto/core/domain/sync";

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

async function syncUserPlaybackAndLibrary(
  userId: string,
  provider: ServerSource,
  items: ScannedMediaItem[],
  syncRunStart: Date,
  allowPrune: boolean,
): Promise<Set<string>> {
  const touchedMediaIds = new Set<string>();

  for (const item of items) {
    const mediaByReference = await findMediaByAnyReference(
      db,
      item.externalIds.tmdb ?? 0,
      "tmdb",
      item.externalIds.imdb,
      item.externalIds.tvdb,
    );
    let mediaId: string | null = mediaByReference?.id ?? null;
    if (!mediaId) {
      const resolvedVersion = await findMediaVersionBySourceAndServerItemId(
        db,
        provider,
        item.serverItemId,
      );
      if (resolvedVersion?.mediaId) mediaId = resolvedVersion.mediaId;
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

    const resolvedType = mediaByReference?.type ?? item.type;
    let episodeId: string | undefined;
    if (
      resolvedType === "show" &&
      Number.isInteger(item.playback.seasonNumber) &&
      Number.isInteger(item.playback.episodeNumber) &&
      (item.playback.seasonNumber ?? -1) >= 0 &&
      (item.playback.episodeNumber ?? -1) >= 0
    ) {
      const found = await findEpisodeIdByMediaAndNumbers(
        db,
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
    const existingProgress = await findUserPlaybackProgress(
      db,
      userId,
      mediaId,
      episodeId ?? null,
    );
    const positionDelta = Math.abs(
      newPosition - (existingProgress?.positionSeconds ?? 0),
    );
    const completionChanged =
      (existingProgress?.isCompleted ?? false) !== newCompleted;
    const shouldPush =
      !existingProgress || positionDelta > 5 || completionChanged;

    await upsertUserPlaybackProgress(db, {
      userId,
      mediaId,
      episodeId,
      positionSeconds: newPosition,
      isCompleted: newCompleted,
      lastWatchedAt: item.playback.lastPlayedAt ?? new Date(),
      source: provider,
    });
    touchedMediaIds.add(mediaId);

    if (shouldPush) {
      // Fire-and-forget; the use case swallows per-server errors so one bad
      // server never stalls the sync loop.
      void pushPlaybackPositionToServers(
        db,
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

  return touchedMediaIds;
}

/* -------------------------------------------------------------------------- */
/*  Global phase: filter items we've already imported recently                */
/* -------------------------------------------------------------------------- */

async function filterItemsNeedingGlobalSync(
  provider: ServerSource,
  items: ScannedMediaItem[],
  alreadySynced: Set<string>,
): Promise<ScannedMediaItem[]> {
  const skipCutoff = new Date(Date.now() - SKIP_RECENTLY_SYNCED_MS);
  const out: ScannedMediaItem[] = [];

  for (const item of items) {
    const libKey = `${provider}:${item.serverLinkId}`;
    if (alreadySynced.has(libKey)) continue;

    const existing = await findMediaVersionBySourceAndServerItemId(
      db,
      provider,
      item.serverItemId,
    );
    if (
      existing?.mediaId &&
      existing.syncedAt &&
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
}

export async function runReverseSync(options: ReverseSyncOptions = {}): Promise<void> {
  const force = options.force === true;
  const allConnections = await findAllUserConnections(db);
  const connections = options.userId
    ? allConnections.filter((c) => c.userId === options.userId)
    : allConnections;
  const tmdbApiKey = await getSetting("tmdb.apiKey");
  if (!tmdbApiKey) throw new Error("TMDB API key not configured");
  const tmdb = new TmdbProvider(tmdbApiKey);

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
      libs.filter((l) => l.sinceMs == null).map((l) => l.linkId),
    );
    const allLinksFullScan = fullScanLinkIds.size === libs.length;
    const deltaLinkCount = libs.length - fullScanLinkIds.size;
    if (deltaLinkCount > 0) {
      console.log(
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
      const now = new Date();
      for (const lib of libs) {
        try {
          await updateServerLink(db, lib.linkId, { lastSyncedAt: now });
        } catch (err) {
          console.error(
            `[reverse-sync] Failed to update lastSyncedAt for link ${lib.linkId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
      if (force || allLinksFullScan) {
        console.warn(
          `[reverse-sync] ${provider} full scan for user ${conn.userId} returned 0 items`,
        );
      }
      continue;
    }

    const syncRunStart = new Date();
    const touchedMediaIds = await syncUserPlaybackAndLibrary(
      conn.userId,
      provider,
      items,
      syncRunStart,
      allLinksFullScan,
    );

    for (const mediaId of touchedMediaIds) {
      await promoteUserMediaStateFromPlayback(db, { userId: conn.userId, mediaId });
    }

    const scannedLinkIds = [...new Set(items.map((i) => i.serverLinkId))];

    const needGlobalSync = await filterItemsNeedingGlobalSync(
      provider,
      items,
      globallySyncedLibraries,
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
        await runSyncPipeline(db, tmdb, needGlobalSync, `${provider}-sync`, {
          forUserId: conn.userId,
        });
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
    const checkpointNow = new Date();
    for (const lib of libs) {
      try {
        await updateServerLink(db, lib.linkId, { lastSyncedAt: checkpointNow });
      } catch (err) {
        console.error(
          `[reverse-sync] Failed to update lastSyncedAt for link ${lib.linkId}:`,
          err instanceof Error ? err.message : err,
        );
      }
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
  return runReverseSync();
}

export async function handlePlexSync(): Promise<void> {
  return runReverseSync();
}

export async function handleReverseSyncFull(): Promise<void> {
  return runReverseSync({ force: true });
}

export async function handleReverseSyncUser(userId: string): Promise<void> {
  return runReverseSync({ userId });
}
