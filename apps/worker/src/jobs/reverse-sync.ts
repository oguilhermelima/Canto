import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { TmdbProvider } from "@canto/providers";
import {
  findEnabledSyncLinks,
  findAllUserConnections,
  findEpisodeIdByMediaAndNumbers,
  findMediaByAnyReference,
  findSyncItemByServerKey,
  upsertUserPlaybackProgress,
} from "@canto/core/infrastructure/repositories";
import { scanJellyfinMedia } from "@canto/core/domain/use-cases/scan-jellyfin-media";
import { scanPlexMedia } from "@canto/core/domain/use-cases/scan-plex-media";
import { processSyncImports } from "@canto/core/domain/use-cases/process-sync-imports";
import type { PendingImport } from "@canto/core/domain/use-cases/scan-jellyfin-media";

function isSyncProvider(value: string): value is "jellyfin" | "plex" {
  return value === "jellyfin" || value === "plex";
}

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
    if (!isSyncProvider(conn.provider)) continue;
    const provider = conn.provider;

    console.log(`[reverse-sync] Processing connection for user ${conn.userId} (${provider})`);

    const syncLinksForConnection = await findEnabledSyncLinks(db, conn.id, provider);
    const syncLinks =
      syncLinksForConnection.length > 0
        ? syncLinksForConnection
        : await findEnabledSyncLinks(db, undefined, provider);

    if (syncLinksForConnection.length === 0 && syncLinks.length > 0) {
      console.warn(
        `[reverse-sync] Using ${syncLinks.length} legacy global link(s) for ${provider} on user ${conn.userId}.`,
      );
    }

    const linked = syncLinks.map((l) => ({
      jellyfinLibraryId: l.serverLibraryId,
      plexLibraryId: l.serverLibraryId,
      type: l.contentType ?? "mixed",
      linkId: l.id,
    }));

    if (linked.length === 0) continue;

    let items: PendingImport[] = [];
    if (provider === "jellyfin" && jellyfinUrl) {
      if (!conn.externalUserId) {
        console.warn(
          `[reverse-sync] Jellyfin connection for user ${conn.userId} is missing externalUserId; user playback metadata may be incomplete.`,
        );
      }
      items = await scanJellyfinMedia(
        jellyfinUrl,
        conn.token,
        linked,
        conn.externalUserId ?? undefined,
      );
    } else if (provider === "plex" && plexUrl) {
      items = await scanPlexMedia(plexUrl, conn.token, linked);
    }

    if (items.length === 0) continue;

    // 1. Update user-specific playback progress and watch history
    for (const item of items) {
      const hasPlaybackPosition = (item.playbackPositionSeconds ?? 0) > 0;
      const isPlayed = item.played === true;
      if (!hasPlaybackPosition && !isPlayed) continue;

      // Find the media in our DB to get its ID.
      // If direct references fail, fall back to the previously resolved sync_item mapping.
      const mediaByReference = await findMediaByAnyReference(
        db,
        item.tmdbId ?? 0,
        "tmdb",
        item.imdbId,
        item.tvdbId,
      );
      let mediaId: string | null = mediaByReference?.id ?? null;
      if (!mediaId) {
        const resolvedSyncItem = await findSyncItemByServerKey(
          db,
          provider,
          item.libraryId,
          item.jellyfinItemId,
          item.plexRatingKey,
          item.serverLinkId,
        );
        if (resolvedSyncItem?.mediaId) {
          mediaId = resolvedSyncItem.mediaId;
        }
      }
      if (!mediaId) continue;
      const resolvedMediaType = mediaByReference?.type ?? item.type;
      let episodeId: string | undefined;
      if (
        resolvedMediaType === "show" &&
        Number.isInteger(item.seasonNumber) &&
        Number.isInteger(item.episodeNumber) &&
        (item.seasonNumber ?? -1) >= 0 &&
        (item.episodeNumber ?? -1) >= 0
      ) {
        const foundEpisodeId = await findEpisodeIdByMediaAndNumbers(
          db,
          mediaId,
          item.seasonNumber ?? 0,
          item.episodeNumber ?? 0,
        );
        if (foundEpisodeId) episodeId = foundEpisodeId;
      }

      // Update progress
      await upsertUserPlaybackProgress(db, {
        userId: conn.userId,
        mediaId,
        episodeId,
        positionSeconds: hasPlaybackPosition ? item.playbackPositionSeconds ?? 0 : 0,
        isCompleted: isPlayed,
        lastWatchedAt: item.lastPlayedAt ?? new Date(),
        source: provider,
      });
    }

    // 2. Handle global library sync (only for libraries not yet synced in this run)
    const newItemsForGlobalSync = items.filter(item => {
      const libKey = `${provider}:${item.serverLinkId}`;
      if (globallySyncedLibraries.has(libKey)) return false;
      return true;
    });

    if (newItemsForGlobalSync.length > 0) {
      console.log(`[reverse-sync] Syncing ${newItemsForGlobalSync.length} new items for global library from user ${conn.userId}`);
      await processSyncImports(db, newItemsForGlobalSync, `${provider}-sync`, tmdb);
      
      // Mark these libraries as globally synced
      for (const item of newItemsForGlobalSync) {
        globallySyncedLibraries.add(`${provider}:${item.serverLinkId}`);
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
