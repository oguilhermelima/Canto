import { db } from "@canto/db/client";
import {
  autoImportTorrent,
} from "@canto/core/domain/torrents/use-cases/import-torrent";
import type { AutoImportMediaRow } from "@canto/core/domain/torrents/use-cases/import-torrent";
import { tryContinuousDownload } from "@canto/core/domain/torrents/use-cases/continuous-download";
import {
  triggerMediaServerScans,
} from "@canto/core/domain/media-servers/use-cases/trigger-scans";
import type { ImportedMedia } from "@canto/core/domain/media-servers/use-cases/trigger-scans";
import type { MediaFile } from "@canto/core/domain/torrents/types/media-file";
import { makeJellyfinAdapter } from "@canto/core/infra/media-servers/jellyfin.adapter-bindings";
import { makePlexAdapter } from "@canto/core/infra/media-servers/plex.adapter-bindings";
import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import { createNodeFileSystemAdapter } from "@canto/core/platform/fs/filesystem";
import { buildIndexers } from "@canto/core/infra/indexers/indexer-factory";
import { makeFoldersRepository } from "@canto/core/infra/file-organization/folders-repository.adapter";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makeNotificationsRepository } from "@canto/core/infra/notifications/notifications-repository.adapter";
import { makeTorrentsRepository } from "@canto/core/infra/torrents/torrents-repository.adapter";
import {
  addListItem,
  ensureServerLibrary,
} from "@canto/core/infra/lists/list-repository";
import { updateRequestStatus } from "@canto/core/infra/requests/request-repository";
import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";

const logger = makeConsoleLogger();

interface ImportedMediaContext {
  mediaRow: AutoImportMediaRow;
  mediaFiles: MediaFile[];
  mediaLocalizationEn: { title: string };
}

export async function handleImportTorrents(): Promise<void> {
  const torrents = makeTorrentsRepository(db);
  const media = makeMediaRepository(db);
  const localization = makeMediaLocalizationRepository(db);
  const folders = makeFoldersRepository(db);
  const notifications = makeNotificationsRepository(db);

  await torrents.resetStaleImports();

  const rows = await torrents.findUnimportedDownloads();

  const toImport = rows.filter(
    (r) => r.status === "completed" && r.hash && r.mediaId,
  );

  if (toImport.length === 0) return;

  console.log(
    `[import-torrents] Found ${toImport.length} completed torrent(s) to import`,
  );

  const importedFolderIds = new Set<string>();
  const mediaContexts = new Map<string, ImportedMediaContext>();
  const fs = createNodeFileSystemAdapter();

  for (const row of toImport) {
    try {
      const claimed = await torrents.claimDownloadForImport(row.id);
      if (!claimed) {
        console.log(
          `[import-torrents] Skipping "${row.title}" — already being imported`,
        );
        continue;
      }

      const qbClient = await getDownloadClient();
      const result = await autoImportTorrent(db, claimed, qbClient, {
        fs,
        logger,
        torrents,
        media,
        localization,
        folders,
        notifications,
      });

      if (result.imported && result.mediaRow && result.mediaLocalizationEn) {
        const { mediaRow, mediaLocalizationEn } = result;

        try {
          if (!row.hash) {
            console.warn(
              `[import-torrents] download row ${row.id} has no hash; skipping qBit category update`,
            );
            return;
          }
          const [torrentInfo] = await qbClient.listTorrents({
            hashes: [row.hash],
          });
          if (torrentInfo) {
            const importedCategory = torrentInfo.category
              ? `${torrentInfo.category}-imported`
              : "imported";
            await qbClient.ensureCategory(importedCategory);
            await qbClient.setCategory(row.hash, importedCategory);
            console.log(
              `[import-torrents] Set qBit category to "${importedCategory}" for "${row.title}"`,
            );
          }
        } catch (err) {
          console.warn(
            `[import-torrents] Failed to update qBit category for "${row.title}":`,
            err instanceof Error ? err.message : err,
          );
        }

        if (!mediaRow.downloaded) {
          await media.updateMedia(mediaRow.id, {
            downloaded: true,
            addedAt: mediaRow.addedAt ?? new Date(),
          });
        }
        if (mediaRow.libraryId) {
          importedFolderIds.add(mediaRow.libraryId);
        }
        if (result.mediaFiles) {
          mediaContexts.set(mediaRow.id, {
            mediaRow,
            mediaFiles: result.mediaFiles,
            mediaLocalizationEn,
          });
        }

        try {
          const serverLib = await ensureServerLibrary(db);
          await addListItem(db, {
            listId: serverLib.id,
            mediaId: mediaRow.id,
          });
        } catch {
          /* already in server library */
        }

        try {
          await updateRequestStatus(db, mediaRow.id, "downloaded");
        } catch {
          /* no pending requests */
        }

        const indexers = await buildIndexers();
        void tryContinuousDownload(
          db,
          { logger, torrents, media, localization },
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
        ).catch(logger.logAndSwallow("import-torrents tryContinuousDownload"));
      }
    } catch (err) {
      console.error(
        `[import-torrents] Error importing "${row.title}":`,
        err instanceof Error ? err.message : err,
      );
      await torrents
        .updateDownload(row.id, { importing: false })
        .catch(logger.logAndSwallow("import-torrents reset importing flag"));
    }
  }

  if (importedFolderIds.size > 0) {
    const importedMedias: ImportedMedia[] = [];
    for (const ctx of mediaContexts.values()) {
      const importedCount = ctx.mediaFiles.filter(
        (f) => f.status === "imported",
      ).length;
      importedMedias.push({
        id: ctx.mediaRow.id,
        title: ctx.mediaLocalizationEn.title,
        type: ctx.mediaRow.type,
        externalId: ctx.mediaRow.externalId,
        provider: ctx.mediaRow.provider,
        mediaFileCount: importedCount,
      });
    }
    await triggerMediaServerScans(
      db,
      { plex: makePlexAdapter(), jellyfin: makeJellyfinAdapter() },
      importedMedias,
    );
  }
}
