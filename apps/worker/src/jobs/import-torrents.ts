import { db } from "@canto/db/client";
import { autoImportTorrent } from "@canto/core/domain/use-cases/import-torrent";
import { tryContinuousDownload } from "@canto/core/domain/use-cases/continuous-download";
import { triggerMediaServerScans } from "@canto/core/domain/use-cases/trigger-media-server-scans";
import { getDownloadClient } from "@canto/core/infrastructure/adapters/download-client-factory";
import { buildIndexers } from "@canto/core/infrastructure/adapters/indexer-factory";
import {
  findUnimportedTorrents,
  findTorrentById,
  findMediaById,
  ensureServerLibrary,
  addListItem,
  updateRequestStatus,
  claimTorrentForImport,
  resetStaleImports,
  updateTorrent,
  updateMedia,
} from "@canto/core/infrastructure/repositories";
import { logAndSwallow } from "@canto/core/lib/log-error";

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
          const indexers = await buildIndexers();
          void tryContinuousDownload(
            db,
            {
              id: mediaRow.id,
              type: mediaRow.type,
              continuousDownload: mediaRow.continuousDownload,
              title: mediaRow.title,
            },
            row.seasonNumber,
            row.episodeNumbers,
            { quality: row.quality, source: row.source },
            indexers,
            qbClient,
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
    await triggerMediaServerScans(db);
  }
}
