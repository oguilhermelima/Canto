import { db } from "@canto/db/client";
import {
  autoImportTorrent,
  type AutoImportMediaRow,
  type AutoImportMediaFiles,
} from "@canto/core/domain/torrents/use-cases/import-torrent";
import { tryContinuousDownload } from "@canto/core/domain/torrents/use-cases/continuous-download";
import {
  triggerMediaServerScans,
  type ImportedMedia,
} from "@canto/core/domain/media-servers/use-cases/trigger-scans";
import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import { createNodeFileSystemAdapter } from "@canto/core/platform/fs/filesystem";
import { buildIndexers } from "@canto/core/infra/indexers/indexer-factory";
import {
  findUnimportedDownloads,
  ensureServerLibrary,
  addListItem,
  updateRequestStatus,
  claimDownloadForImport,
  resetStaleImports,
  updateDownload,
  updateMedia,
} from "@canto/core/infra/repositories";
import { logAndSwallow } from "@canto/core/platform/logger/log-error";

interface ImportedMediaContext {
  mediaRow: AutoImportMediaRow;
  mediaFiles: AutoImportMediaFiles;
  mediaLocalizationEn: { title: string };
}

/* -------------------------------------------------------------------------- */
/*  Main handler                                                               */
/* -------------------------------------------------------------------------- */

export async function handleImportTorrents(): Promise<void> {
  // Reset torrents stuck with importing=true for over 30 minutes (e.g., worker crash)
  await resetStaleImports(db);

  const rows = await findUnimportedDownloads(db);

  const toImport = rows.filter(
    (r) => r.status === "completed" && r.hash && r.mediaId,
  );

  if (toImport.length === 0) return;

  console.log(
    `[import-torrents] Found ${toImport.length} completed torrent(s) to import`,
  );

  const importedFolderIds = new Set<string>();
  // Cache the media context returned by autoImportTorrent so the post-loop
  // scan trigger doesn't have to re-query findMediaById /
  // findMediaFilesByMediaId / findMediaLocalized per imported torrent.
  const mediaContexts = new Map<string, ImportedMediaContext>();
  const fs = createNodeFileSystemAdapter();

  for (const row of toImport) {
    try {
      // Atomically claim the torrent to prevent race conditions with merge-live-data
      const claimed = await claimDownloadForImport(db, row.id);
      if (!claimed) {
        console.log(`[import-torrents] Skipping "${row.title}" — already being imported`);
        continue;
      }

      const qbClient = await getDownloadClient();
      const result = await autoImportTorrent(db, claimed, qbClient, { fs });

      if (result.imported && result.mediaRow && result.mediaLocalizationEn) {
        const { mediaRow, mediaLocalizationEn } = result;

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

        // Mark the media as downloaded the first time we import any of its files.
        if (!mediaRow.downloaded) {
          await updateMedia(db, mediaRow.id, {
            downloaded: true,
            addedAt: mediaRow.addedAt ?? new Date(),
          });
        }
        if (mediaRow.libraryId) {
          importedFolderIds.add(mediaRow.libraryId);
        }
        // Cache only when mediaFiles loaded — the post-loop trigger relies on
        // the file count, so a failed load skips the scan for this media.
        // Newer imports for the same media row replace earlier cached files
        // so triggerMediaServerScans counts the freshest media-server view.
        if (result.mediaFiles) {
          mediaContexts.set(mediaRow.id, {
            mediaRow,
            mediaFiles: result.mediaFiles,
            mediaLocalizationEn,
          });
        }

        // Add to Server Library list
        try {
          const serverLib = await ensureServerLibrary(db);
          await addListItem(db, { listId: serverLib.id, mediaId: mediaRow.id });
        } catch { /* already in server library */ }

        // Update download requests to "downloaded"
        try {
          await updateRequestStatus(db, mediaRow.id, "downloaded");
        } catch { /* no pending requests */ }

        // Continuous download: try to grab next episode (matching quality)
        const indexers = await buildIndexers();
        void tryContinuousDownload(
          db,
          {
            id: mediaRow.id,
            type: mediaRow.type,
            continuousDownload: mediaRow.continuousDownload,
            title: mediaLocalizationEn.title,
          },
          row.seasonNumber,
          row.episodeNumbers,
          { quality: row.quality, source: row.source },
          indexers,
          qbClient,
        ).catch(logAndSwallow("import-torrents tryContinuousDownload"));
      }
    } catch (err) {
      console.error(
        `[import-torrents] Error importing "${row.title}":`,
        err instanceof Error ? err.message : err,
      );
      // Defensive reset — autoImportTorrent's own try/finally already clears
      // the flag, but if the call itself or downstream code throws before
      // that finally runs we still want the row eligible for retry.
      await updateDownload(db, row.id, { importing: false }).catch(
        logAndSwallow("import-torrents reset importing flag"),
      );
    }
  }

  // Trigger media server scans after successful imports
  if (importedFolderIds.size > 0) {
    const importedMedias: ImportedMedia[] = [];
    for (const ctx of mediaContexts.values()) {
      const importedCount = ctx.mediaFiles.filter((f) => f.status === "imported").length;
      importedMedias.push({
        id: ctx.mediaRow.id,
        title: ctx.mediaLocalizationEn.title,
        type: ctx.mediaRow.type,
        externalId: ctx.mediaRow.externalId,
        provider: ctx.mediaRow.provider,
        mediaFileCount: importedCount,
      });
    }
    await triggerMediaServerScans(db, importedMedias);
  }
}
