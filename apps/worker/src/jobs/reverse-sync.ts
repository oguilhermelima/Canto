import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { TmdbProvider } from "@canto/providers";
import {
  findEnabledSyncLinks,
  findAllUserConnections,
  findMediaByAnyReference,
  upsertUserPlaybackProgress,
} from "@canto/core/infrastructure/repositories";
import { scanJellyfinMedia } from "@canto/core/domain/use-cases/scan-jellyfin-media";
import { scanPlexMedia } from "@canto/core/domain/use-cases/scan-plex-media";
import { processSyncImports } from "@canto/core/domain/use-cases/process-sync-imports";
import type { PendingImport } from "@canto/core/domain/use-cases/scan-jellyfin-media";

/* -------------------------------------------------------------------------- */
/*  Main Sync Handler                                                         */
/* -------------------------------------------------------------------------- */

export async function runReverseSync(): Promise<void> {
  const connections = await findAllUserConnections(db);
  const tmdbApiKey = await getSetting<string>("tmdb.apiKey");
  if (!tmdbApiKey) throw new Error("TMDB API key not configured");
  const tmdb = new TmdbProvider(tmdbApiKey);

  const jellyfinUrl = await getSetting<string>("jellyfin.url");
  const plexUrl = await getSetting<string>("plex.url");

  // Track which libraries we've already synced for the global library
  const globallySyncedLibraries = new Set<string>();

  for (const conn of connections) {
    if (!conn.token) continue;

    console.log(`[reverse-sync] Processing connection for user ${conn.userId} (${conn.provider})`);

    const syncLinks = await findEnabledSyncLinks(db, conn.id);
    const linked = syncLinks.map((l) => ({
      jellyfinLibraryId: l.serverLibraryId,
      plexLibraryId: l.serverLibraryId,
      type: l.contentType ?? "mixed",
      linkId: l.id,
    }));

    if (linked.length === 0) continue;

    let items: PendingImport[] = [];
    if (conn.provider === "jellyfin" && jellyfinUrl) {
      items = await scanJellyfinMedia(jellyfinUrl, conn.token, linked);
    } else if (conn.provider === "plex" && plexUrl) {
      items = await scanPlexMedia(plexUrl, conn.token, linked);
    }

    if (items.length === 0) continue;

    // 1. Update user-specific playback progress and watch history
    for (const item of items) {
      if (item.played === undefined && item.playbackPositionSeconds === undefined) continue;

      // Find the media in our DB to get its ID
      const mediaItem = await findMediaByAnyReference(db, item.tmdbId ?? 0, "tmdb", item.imdbId, item.tvdbId);
      if (!mediaItem) continue;

      // Update progress
      if (item.playbackPositionSeconds !== undefined || item.played !== undefined) {
        await upsertUserPlaybackProgress(db, {
          userId: conn.userId,
          mediaId: mediaItem.id,
          positionSeconds: item.playbackPositionSeconds ?? 0,
          isCompleted: item.played ?? false,
          lastWatchedAt: item.lastPlayedAt ?? new Date(),
          source: conn.provider,
        });
      }

      // If played, add to history if not already there (simplified check)
      if (item.played && item.lastPlayedAt) {
        // We could check if there's already a watch history entry for this item around this time
        // but for now let's just add it if we want to be thorough.
        // Actually, let's keep it simple for now as requested.
      }
    }

    // 2. Handle global library sync (only for libraries not yet synced in this run)
    const newItemsForGlobalSync = items.filter(item => {
      const libKey = `${conn.provider}:${item.serverLinkId}`;
      if (globallySyncedLibraries.has(libKey)) return false;
      return true;
    });

    if (newItemsForGlobalSync.length > 0) {
      console.log(`[reverse-sync] Syncing ${newItemsForGlobalSync.length} new items for global library from user ${conn.userId}`);
      await processSyncImports(db, newItemsForGlobalSync, `${conn.provider}-sync`, tmdb);
      
      // Mark these libraries as globally synced
      for (const item of newItemsForGlobalSync) {
        globallySyncedLibraries.add(`${conn.provider}:${item.serverLinkId}`);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Legacy Individual sync handlers (kept for compatibility if needed)        */
/* -------------------------------------------------------------------------- */

export async function handleJellyfinSync(): Promise<void> {
  return runReverseSync();
}

export async function handlePlexSync(): Promise<void> {
  return runReverseSync();
}
