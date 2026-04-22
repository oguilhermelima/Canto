import { db } from "@canto/db/client";
import { autoImportTorrent } from "@canto/core/domain/use-cases/torrents/import-torrent";
import { tryContinuousDownload } from "@canto/core/domain/use-cases/torrents/continuous-download";
import {
  triggerMediaServerScans,
  type ImportedMedia,
} from "@canto/core/domain/use-cases/media-servers/trigger-scans";
import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import { createNodeFileSystemAdapter } from "@canto/core/platform/fs/filesystem";
import { buildIndexers } from "@canto/core/infra/indexers/indexer-factory";
import {
  findUnimportedTorrents,
  findTorrentById,
  findMediaById,
  findMediaFilesByMediaId,
  ensureServerLibrary,
  addListItem,
  updateRequestStatus,
  claimTorrentForImport,
  resetStaleImports,
  updateTorrent,
  updateMedia,
} from "@canto/core/infra/repositories";
import { logAndSwallow } from "@canto/core/platform/logger/log-error";

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
  const importedMediaIds = new Set<string>();
  const fs = createNodeFileSystemAdapter();

  for (const row of toImport) {
    try {
      // Atomically claim the torrent to prevent race conditions with merge-live-data
      const claimed = await claimTorrentForImport(db, row.id);
      if (!claimed) {
        console.log(`[import-torrents] Skipping "${row.title}" — already being imported`);
        continue;
      }

      const qbClient = await getDownloadClient();
      await autoImportTorrent(db, claimed, qbClient, { fs });

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
          importedMediaIds.add(mediaRow.id);
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
    const importedMedias: ImportedMedia[] = [];
    for (const mediaId of importedMediaIds) {
      const mediaRow = await findMediaById(db, mediaId);
      if (!mediaRow) continue;
      const files = await findMediaFilesByMediaId(db, mediaId);
      const importedCount = files.filter((f) => f.status === "imported").length;
      importedMedias.push({
        id: mediaRow.id,
        title: mediaRow.title,
        type: mediaRow.type,
        externalId: mediaRow.externalId,
        provider: mediaRow.provider,
        mediaFileCount: importedCount,
      });
    }
    await triggerMediaServerScans(db, importedMedias);
  }
}
