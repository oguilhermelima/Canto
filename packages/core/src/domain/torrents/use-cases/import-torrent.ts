import path from "node:path";

import type { Database } from "@canto/db/client";
import type { download as downloadSchema } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { FileSystemPort } from "@canto/core/domain/shared/ports/file-system.port";
import { isVideoFile, buildMediaDir } from "@canto/core/domain/shared/rules/naming";
import { EP_PATTERN, isSubtitleFile } from "@canto/core/domain/torrents/rules/parsing";
import { getEffectiveProviderSync } from "@canto/core/domain/shared/rules/effective-provider";
import { createNotification } from "@canto/core/domain/notifications/use-cases/create-notification";
import { makeNotificationsRepository } from "@canto/core/infra/notifications/notifications-repository.adapter";
import { findMediaByIdWithSeasons } from "@canto/core/infra/media/media-repository";
import {
  findDefaultFolder,
  findFolderById,
} from "@canto/core/infra/file-organization/folder-repository";
import {
  findMediaFilesByDownloadId,
  findMediaFilesByMediaId,
} from "@canto/core/infra/media/media-file-repository";
import { updateDownload } from "@canto/core/infra/torrents/download-repository";
import { findMediaLocalized } from "@canto/core/infra/media/media-localized-repository";
import { parseVideoFiles } from "@canto/core/platform/fs/filesystem";

import { resolveSavePath } from "@canto/core/domain/torrents/use-cases/import-torrent/shared";
import {
  importLocalSubtitleFiles,
  importLocalVideoFiles,
} from "@canto/core/domain/torrents/use-cases/import-torrent/local";
import {
  importRemoteSubtitleFiles,
  importRemoteVideoFiles,
} from "@canto/core/domain/torrents/use-cases/import-torrent/remote";

export {
  resolveSavePath,
  upsertMediaFile,
} from "@canto/core/domain/torrents/use-cases/import-torrent/shared";
export {
  importLocalSubtitleFiles,
  importLocalVideoFiles,
} from "@canto/core/domain/torrents/use-cases/import-torrent/local";
export {
  importRemoteSubtitleFiles,
  importRemoteVideoFiles,
} from "@canto/core/domain/torrents/use-cases/import-torrent/remote";

export interface ImportHooks {
  onImported?: (mediaRow: { id: string; title: string; externalId: number; provider: string; type: string; libraryId: string | null }) => void;
}

type ImportMethod = "local" | "remote";

export type AutoImportMediaRow = NonNullable<
  Awaited<ReturnType<typeof findMediaByIdWithSeasons>>
>;
export type AutoImportMediaFiles = Awaited<
  ReturnType<typeof findMediaFilesByMediaId>
>;

/**
 * What `autoImportTorrent` returns. Callers (cron handler, manual API) reuse
 * the data here instead of re-querying download → media → files →
 * localization after a successful import.
 *
 * - `imported` mirrors the `download.imported` flag we wrote.
 * - `mediaRow`, `mediaLocalizationEn` are populated as soon as `findMediaByIdWithSeasons`
 *   resolves (so partial-failure paths still surface them).
 * - `mediaFiles` is populated only on the success path — refetched once
 *   here to power downstream Jellyfin auto-merge counts.
 */
export interface AutoImportResult {
  imported: boolean;
  importedCount: number;
  contentPath: string | null;
  mediaRow: AutoImportMediaRow | null;
  mediaFiles: AutoImportMediaFiles | null;
  mediaLocalizationEn: { title: string } | null;
}

export async function autoImportTorrent(
  db: Database,
  torrentRow: typeof downloadSchema.$inferSelect,
  client: DownloadClientPort,
  deps: { fs: FileSystemPort },
  hooks?: ImportHooks,
): Promise<AutoImportResult> {
  const result: AutoImportResult = {
    imported: false,
    importedCount: 0,
    contentPath: null,
    mediaRow: null,
    mediaFiles: null,
    mediaLocalizationEn: null,
  };
  // Single deferred update — every early-return / success / partial / catch
  // path mutates this and the `finally` block writes it once. Was 11 separate
  // updateDownload calls per attempt before this refactor.
  const downloadUpdate: Partial<typeof downloadSchema.$inferInsert> = {
    importing: false,
  };
  const notificationsRepo = makeNotificationsRepository(db);

  try {
    if (!torrentRow.hash || !torrentRow.mediaId) return result;

    const mediaRow = await findMediaByIdWithSeasons(db, torrentRow.mediaId);
    if (!mediaRow) return result;
    result.mediaRow = mediaRow;

    const placeholders = await findMediaFilesByDownloadId(db, torrentRow.id, "pending");
    const alreadyImported = await findMediaFilesByDownloadId(db, torrentRow.id, "imported");

    const rawMethod = (await getSetting("download.importMethod")) ?? "local";
    const importMethod: ImportMethod = rawMethod === "remote" ? "remote" : "local";

    const libRow = mediaRow.libraryId
      ? await findFolderById(db, mediaRow.libraryId)
      : await findDefaultFolder(db);

    // Naming uses the canonical en-US title — release groups and library
    // folders mirror the English title, not the user's localized variant.
    const enLoc = await findMediaLocalized(db, mediaRow.id, "en-US");
    const mediaLocalizationEn = { title: enLoc?.title ?? "" };
    result.mediaLocalizationEn = mediaLocalizationEn;
    const globalTvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;
    const effectiveProvider = getEffectiveProviderSync(mediaRow, globalTvdbEnabled);
    const namingExternalId =
      effectiveProvider === "tvdb" && mediaRow.tvdbId
        ? mediaRow.tvdbId
        : mediaRow.externalId;

    const mediaNaming = {
      title: mediaLocalizationEn.title,
      year: mediaRow.year,
      externalId: namingExternalId,
      provider: effectiveProvider,
      type: mediaRow.type,
    };

    const files = await client.getTorrentFiles(torrentRow.hash);
    const videoFiles = files.filter((f) => isVideoFile(f.name));
    const subtitleFiles = files.filter((f) => isSubtitleFile(f.name));

    if (videoFiles.length === 0) return result;

    if (mediaRow.type === "movie" && videoFiles.length > 1) {
      console.warn(
        `[auto-import] Movie "${mediaNaming.title}" has ${videoFiles.length} video files — skipping auto-import`,
      );
      await createNotification({ repo: notificationsRepo }, {
        title: "Movie import skipped",
        message: `"${mediaNaming.title}" has ${videoFiles.length} video files — expected a single file for movies.`,
        type: "movie_multi_file",
        mediaId: mediaRow.id,
      });
      return result;
    }

    let primarySeasonNumber = torrentRow.seasonNumber ?? undefined;
    if (!primarySeasonNumber && mediaRow.type === "show") {
      const match = EP_PATTERN.exec(videoFiles[0]?.name ?? "");
      if (match) {
        primarySeasonNumber = parseInt(match[1]!, 10);
      } else {
        primarySeasonNumber = 1;
      }
    }

    const parsedFiles = parseVideoFiles(videoFiles, mediaRow, mediaNaming, torrentRow, primarySeasonNumber);

    if (parsedFiles.length === 0) {
      console.warn(`[auto-import] No valid files to import for "${mediaNaming.title}" — all episodes unresolvable`);
      return result;
    }

    const mediaDir = buildMediaDir(mediaNaming, primarySeasonNumber);

    let importedCount: number;
    let contentPath: string;

    if (importMethod === "local") {
      const libraryPath = libRow?.libraryPath;
      if (!libraryPath) {
        console.error(`[auto-import] No library path configured for "${mediaNaming.title}" — configure paths in Settings > Downloads`);
        await createNotification({ repo: notificationsRepo }, {
          title: "Import failed — paths not configured",
          message: `No library path set for "${mediaNaming.title}". Go to Settings > Downloads to configure your paths.`,
          type: "import_failed",
          mediaId: mediaRow.id,
        });
        return result;
      }
      const targetDir = path.join(libraryPath, mediaDir);

      try {
        await deps.fs.mkdir(targetDir, { recursive: true });
      } catch (err) {
        console.error(`[auto-import] Failed to create target dir "${targetDir}":`, err);
        return result;
      }

      let savePath: string;
      try {
        savePath = await resolveSavePath(client, torrentRow.hash);
      } catch (err) {
        console.error(`[auto-import] Failed to resolve save path for "${torrentRow.title}":`, err instanceof Error ? err.message : err);
        return result;
      }

      importedCount = await importLocalVideoFiles(
        parsedFiles, savePath, targetDir, libraryPath, mediaNaming,
        primarySeasonNumber, placeholders, alreadyImported, db, mediaRow, torrentRow, deps.fs,
      );

      await importLocalSubtitleFiles(
        subtitleFiles, savePath, targetDir, libraryPath, mediaRow, mediaNaming, torrentRow, primarySeasonNumber, deps.fs,
      );

      contentPath = targetDir;
    } else {
      const libraryBasePath = libRow?.libraryPath;
      if (!libraryBasePath) {
        console.error(`[auto-import] No library path configured for "${mediaNaming.title}" — configure paths in Settings > Downloads`);
        await createNotification({ repo: notificationsRepo }, {
          title: "Import failed — paths not configured",
          message: `No library path set for "${mediaNaming.title}". Go to Settings > Downloads to configure your paths.`,
          type: "import_failed",
          mediaId: mediaRow.id,
        });
        return result;
      }
      // qBit and worker may mount the same host volume under different container
      // paths (e.g. qBit `/medias/Animes`, worker `/media/Animes`). qBit's API
      // only understands its own mount path, so use the folder's downloadPath
      // when telling qBit where to move files; fall back to libraryPath if it's
      // not set (single-mount setups).
      const qbitBasePath = libRow?.downloadPath ?? libraryBasePath;
      const qbitTargetLocation = `${qbitBasePath}/${mediaDir}`;
      const libraryTargetLocation = `${libraryBasePath}/${mediaDir}`;

      // Pre-create the series folder via the worker's mount so qBit always
      // sees a valid destination on the shared volume.
      try {
        await deps.fs.mkdir(libraryTargetLocation, { recursive: true });
      } catch (err) {
        console.error(`[auto-import] Failed to create target dir "${libraryTargetLocation}":`, err);
        return result;
      }

      const remoteResult = await importRemoteVideoFiles(
        parsedFiles, client, torrentRow.hash, qbitTargetLocation, libraryTargetLocation,
        libRow ?? null, placeholders, alreadyImported, db, mediaRow, torrentRow, files,
      );
      importedCount = remoteResult.importedCount;

      // Reuse the post-move file list returned from importRemoteVideoFiles —
      // the pre-move `subtitleFiles` paths would be stale (qBit reports
      // post-move filenames). Saves a redundant getTorrentFiles call.
      const freshSubtitleFiles = remoteResult.postMoveFiles
        .filter((f) => isSubtitleFile(f.name))
        .map((f) => ({ name: f.name, size: f.size }));

      await importRemoteSubtitleFiles(
        freshSubtitleFiles, client, torrentRow.hash, mediaRow, mediaNaming, torrentRow, primarySeasonNumber,
      );

      contentPath = libraryTargetLocation;
    }

    const totalExpected = videoFiles.length;
    const allImported = importedCount >= totalExpected;

    result.importedCount = importedCount;
    result.contentPath = contentPath;
    downloadUpdate.importMethod = importMethod;
    downloadUpdate.contentPath = contentPath;

    if (allImported) {
      downloadUpdate.imported = true;
      result.imported = true;
      // Fetch the full per-media file list once so the handler's post-loop
      // doesn't need a separate findMediaFilesByMediaId per imported torrent.
      // The list drives Jellyfin's multi-version auto-merge count. A failure
      // here is non-fatal — the import has already succeeded on disk + DB;
      // worst case the handler skips this media's scan trigger.
      try {
        result.mediaFiles = await findMediaFilesByMediaId(db, mediaRow.id);
      } catch (err) {
        console.error(
          `[auto-import] Failed to load media files for ${mediaRow.id}:`,
          err instanceof Error ? err.message : err,
        );
      }

      console.log(`[auto-import] [${importMethod}] Imported ${importedCount}/${totalExpected} file(s) for "${mediaNaming.title}"`);
      hooks?.onImported?.({
        ...mediaRow,
        title: mediaNaming.title,
        libraryId: mediaRow.libraryId ?? null,
      });
      await createNotification({ repo: notificationsRepo }, {
        title: "Import complete",
        message: `Imported ${importedCount} file(s) for "${mediaNaming.title}"`,
        type: "import_success",
        mediaId: mediaRow.id,
      });
    } else {
      const newAttempts = (torrentRow.importAttempts ?? 0) + 1;
      downloadUpdate.importAttempts = newAttempts;

      console.warn(
        `[auto-import] [${importMethod}] Partial import: ${importedCount}/${totalExpected} file(s) for "${mediaNaming.title}" — will retry (attempt ${newAttempts}/5)`,
      );

      if (newAttempts >= 5) {
        await createNotification({ repo: notificationsRepo }, {
          title: "Import failed",
          message: `Failed to import "${mediaNaming.title}" after ${newAttempts} attempts. Check your library paths in Settings > Downloads or try importing manually.`,
          type: "import_failed",
          mediaId: mediaRow.id,
        });
      } else if (importedCount > 0) {
        await createNotification({ repo: notificationsRepo }, {
          title: "Partial import",
          message: `Imported ${importedCount} of ${totalExpected} file(s) for "${mediaNaming.title}". Will retry remaining files.`,
          type: "import_failed",
          mediaId: mediaRow.id,
        });
      } else if (newAttempts === 1) {
        await createNotification({ repo: notificationsRepo }, {
          title: "Import retry",
          message: `Could not import "${mediaNaming.title}" — will retry. If this persists, check your library and download paths in Settings > Downloads.`,
          type: "import_warning",
          mediaId: mediaRow.id,
        });
      }
    }
  } catch (err) {
    console.error(`[auto-import] Unexpected error for "${torrentRow.title}":`, err instanceof Error ? err.message : err);
  } finally {
    // Single write at the end — wrapping in try/catch so a DB hiccup here
    // doesn't mask the actual import outcome from the caller.
    try {
      await updateDownload(db, torrentRow.id, downloadUpdate);
    } catch (err) {
      console.error(
        `[auto-import] Failed to persist download update for ${torrentRow.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return result;
}
