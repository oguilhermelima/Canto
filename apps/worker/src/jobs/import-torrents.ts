import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "@canto/api/lib/settings-keys";
import { searchTorrents } from "@canto/api/domain/use-cases/search-torrents";
import { downloadTorrent } from "@canto/api/domain/use-cases/download-torrent";
import { autoImportTorrent } from "@canto/api/domain/use-cases/import-torrent";
import { getDownloadClient } from "@canto/api/infrastructure/adapters/download-client-factory";
import { buildIndexers } from "@canto/api/infrastructure/adapters/indexer-factory";
import {
  findUnimportedTorrents,
  findTorrentById,
  findMediaById,
  findAllServerLinks,
  ensureServerLibrary,
  addListItem,
  updateRequestStatus,
  claimTorrentForImport,
  resetStaleImports,
  updateTorrent,
  updateMedia,
} from "@canto/api/infrastructure/repositories";
import { logAndSwallow } from "@canto/api/lib/log-error";

/* -------------------------------------------------------------------------- */
/*  Media server scan trigger (via folder_server_link junction)                */
/* -------------------------------------------------------------------------- */

async function triggerMediaServerScans(): Promise<void> {
  const links = await findAllServerLinks(db);
  if (links.length === 0) return;

  const jellyfinUrl = await getSetting(SETTINGS.JELLYFIN_URL);
  const jellyfinKey = await getSetting(SETTINGS.JELLYFIN_API_KEY);
  const plexUrl = await getSetting(SETTINGS.PLEX_URL);
  const plexToken = await getSetting(SETTINGS.PLEX_TOKEN);

  for (const link of links) {
    if (link.serverType === "jellyfin" && jellyfinUrl && jellyfinKey) {
      try {
        if (link.serverLibraryId) {
          await fetch(`${jellyfinUrl}/Library/${link.serverLibraryId}/Refresh`, {
            method: "POST",
            headers: { "X-Emby-Token": jellyfinKey },
          });
          console.log(`[import-torrents] Triggered Jellyfin scan for library ${link.serverLibraryId}`);
        } else {
          await fetch(`${jellyfinUrl}/Library/Refresh`, {
            method: "POST",
            headers: { "X-Emby-Token": jellyfinKey },
          });
          console.log("[import-torrents] Triggered Jellyfin full library scan");
        }
      } catch (err) {
        console.warn("[import-torrents] Failed to trigger Jellyfin scan:", err);
      }
    }

    if (link.serverType === "plex" && plexUrl && plexToken) {
      try {
        await fetch(
          `${plexUrl}/library/sections/${link.serverLibraryId}/refresh?X-Plex-Token=${plexToken}`,
        );
        console.log(`[import-torrents] Triggered Plex scan for section ${link.serverLibraryId}`);
      } catch (err) {
        console.warn("[import-torrents] Failed to trigger Plex scan:", err);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Main handler                                                               */
/* -------------------------------------------------------------------------- */

export async function handleImportTorrents(): Promise<void> {
  // Reset torrents stuck with importing=true for over 30 minutes (e.g., worker crash)
  await resetStaleImports(db);

  const rows = await findUnimportedTorrents(db);

  const toImport = rows.filter(
    (r) => r.status === "completed" && r.hash && r.mediaId,
  );

  if (toImport.length === 0) return;

  console.log(
    `[import-torrents] Found ${toImport.length} completed torrent(s) to import`,
  );

  const importedFolderIds = new Set<string>();

  for (const row of toImport) {
    try {
      // Atomically claim the torrent to prevent race conditions with merge-live-data
      const claimed = await claimTorrentForImport(db, row.id);
      if (!claimed) {
        console.log(`[import-torrents] Skipping "${row.title}" — already being imported`);
        continue;
      }

      const qbClient = await getDownloadClient();
      await autoImportTorrent(db, claimed, qbClient);

      // Re-read row to check if import succeeded
      const updated = await findTorrentById(db, row.id);

      if (updated?.imported) {
        // Mark the torrent as imported in qBittorrent by updating its category
        try {
          const [torrentInfo] = await qbClient.listTorrents({ hashes: [row.hash!] });
          if (torrentInfo) {
            const importedCategory = torrentInfo.category
              ? `${torrentInfo.category}-imported`
              : "imported";
            await qbClient.ensureCategory(importedCategory);
            await qbClient.setCategory(row.hash!, importedCategory);
            console.log(`[import-torrents] Set qBit category to "${importedCategory}" for "${row.title}"`);
          }
        } catch (err) {
          console.warn(
            `[import-torrents] Failed to update qBit category for "${row.title}":`,
            err instanceof Error ? err.message : err,
          );
        }
        // Get the library ID from the linked media and mark as downloaded
        const mediaRow = updated.mediaId
          ? await findMediaById(db, updated.mediaId)
          : null;
        if (mediaRow) {
          if (!mediaRow.downloaded) {
            await updateMedia(db, mediaRow.id, {
              downloaded: true,
              addedAt: mediaRow.addedAt ?? new Date(),
            });
          }
          if (mediaRow.libraryId) {
            importedFolderIds.add(mediaRow.libraryId);
          }
        }

        // Add to Server Library list
        if (updated.mediaId) {
          try {
            const serverLib = await ensureServerLibrary(db);
            await addListItem(db, { listId: serverLib.id, mediaId: updated.mediaId });
          } catch { /* already in server library */ }

          // Update download requests to "downloaded"
          try {
            await updateRequestStatus(db, updated.mediaId, "downloaded");
          } catch { /* no pending requests */ }
        }

        // Continuous download: try to grab next episode (matching quality)
        if (updated.mediaId && mediaRow) {
          void tryContinuousDownload(
            {
              id: mediaRow.id,
              type: mediaRow.type,
              continuousDownload: mediaRow.continuousDownload,
              title: mediaRow.title,
            },
            row.seasonNumber,
            row.episodeNumbers,
            { quality: row.quality, source: row.source },
          ).catch(logAndSwallow("import-torrents tryContinuousDownload"));
        }
      }
    } catch (err) {
      console.error(
        `[import-torrents] Error importing "${row.title}":`,
        err instanceof Error ? err.message : err,
      );
      // Reset importing flag so the torrent can be retried on next cycle
      await updateTorrent(db, row.id, { importing: false }).catch(
        logAndSwallow("import-torrents reset importing flag"),
      );
    }
  }

  // Trigger media server scans after successful imports
  if (importedFolderIds.size > 0) {
    await triggerMediaServerScans();
  }
}

async function tryContinuousDownload(
  mediaRow: { id: string; type: string; continuousDownload: boolean; title: string },
  importedSeasonNumber: number | null,
  importedEpisodeNumbers: number[] | null,
  preferredQuality?: { quality: string; source: string },
): Promise<void> {
  if (mediaRow.type !== "show" || !mediaRow.continuousDownload) return;
  if (!importedEpisodeNumbers?.length || !importedSeasonNumber) return;

  const lastImportedEp = Math.max(...importedEpisodeNumbers);
  const nextEp = lastImportedEp + 1;

  console.log(`[continuous-download] Searching next episode S${String(importedSeasonNumber).padStart(2, "0")}E${String(nextEp).padStart(2, "0")} for "${mediaRow.title}"`);

  try {
    const indexers = await buildIndexers();
    const { results } = await searchTorrents(db, {
      mediaId: mediaRow.id,
      seasonNumber: importedSeasonNumber,
      episodeNumbers: [nextEp],
    }, indexers);

    if (results.length === 0) {
      console.log(`[continuous-download] No results for next episode`);
      return;
    }

    // Prefer results matching the quality/source of the previously imported episode
    let best = results[0]!;
    if (preferredQuality && preferredQuality.quality !== "unknown") {
      const matching = results.find(
        (r) => r.quality === preferredQuality.quality && (preferredQuality.source === "unknown" || r.source === preferredQuality.source),
      );
      if (matching) best = matching;
    }
    console.log(`[continuous-download] Auto-downloading "${best.title}" (confidence: ${best.confidence})`);

    const qbClient = await getDownloadClient();
    await downloadTorrent(db, {
      mediaId: mediaRow.id,
      title: best.title,
      magnetUrl: best.magnetUrl ?? undefined,
      torrentUrl: best.downloadUrl ?? undefined,
      seasonNumber: importedSeasonNumber,
      episodeNumbers: [nextEp],
    }, qbClient);
  } catch (err) {
    console.warn(
      `[continuous-download] Failed for "${mediaRow.title}":`,
      err instanceof Error ? err.message : err,
    );
  }
}

