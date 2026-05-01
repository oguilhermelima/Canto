import path from "node:path";

import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";

import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import { createNotification } from "@canto/core/domain/notifications/use-cases/create-notification";
import type { NotificationsRepositoryPort } from "@canto/core/domain/notifications/ports/notifications-repository.port";
import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { FileSystemPort } from "@canto/core/domain/shared/ports/file-system.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import { getEffectiveProviderSync } from "@canto/core/domain/shared/rules/effective-provider";
import { isVideoFile, buildMediaDir } from "@canto/core/domain/shared/rules/naming";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import { EP_PATTERN, isSubtitleFile } from "@canto/core/domain/torrents/rules/parsing";
import { parseVideoFiles } from "@canto/core/domain/torrents/rules/parse-video-files";
import type { Download } from "@canto/core/domain/torrents/types/download";
import type { MediaFile } from "@canto/core/domain/torrents/types/media-file";

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
  onImported?: (mediaRow: {
    id: string;
    title: string;
    externalId: number;
    provider: string;
    type: string;
    libraryId: string | null;
  }) => void;
}

type ImportMethod = "local" | "remote";

export type AutoImportMediaRow = NonNullable<
  Awaited<ReturnType<MediaRepositoryPort["findByIdWithSeasons"]>>
>;

export interface AutoImportResult {
  imported: boolean;
  importedCount: number;
  contentPath: string | null;
  mediaRow: AutoImportMediaRow | null;
  mediaFiles: MediaFile[] | null;
  mediaLocalizationEn: { title: string } | null;
}

export interface AutoImportTorrentDeps {
  fs: FileSystemPort;
  logger: LoggerPort;
  torrents: TorrentsRepositoryPort;
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  folders: FoldersRepositoryPort;
  notifications: NotificationsRepositoryPort;
}

const MAX_IMPORT_ATTEMPTS = 5;

export async function autoImportTorrent(
  _db: Database,
  torrentRow: Download,
  client: DownloadClientPort,
  deps: AutoImportTorrentDeps,
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
  // path mutates this and the `finally` block writes it once.
  const downloadUpdate: Parameters<TorrentsRepositoryPort["updateDownload"]>[1] =
    {
      importing: false,
    };

  try {
    if (!torrentRow.hash || !torrentRow.mediaId) return result;

    const mediaRow = await deps.media.findByIdWithSeasons(torrentRow.mediaId);
    if (!mediaRow) return result;
    result.mediaRow = mediaRow;

    const placeholders = await deps.torrents.findMediaFilesByDownloadId(
      torrentRow.id,
      "pending",
    );
    const alreadyImported = await deps.torrents.findMediaFilesByDownloadId(
      torrentRow.id,
      "imported",
    );

    const rawMethod = (await getSetting("download.importMethod")) ?? "local";
    const importMethod: ImportMethod =
      rawMethod === "remote" ? "remote" : "local";

    const libRow = mediaRow.libraryId
      ? await deps.folders.findFolderById(mediaRow.libraryId)
      : await deps.folders.findDefaultFolder();

    const enLoc = await deps.localization.findOne(mediaRow.id, "en-US");
    const mediaLocalizationEn = { title: enLoc?.title ?? "" };
    result.mediaLocalizationEn = mediaLocalizationEn;
    const globalTvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;
    const effectiveProvider = getEffectiveProviderSync(
      mediaRow,
      globalTvdbEnabled,
    );
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
      deps.logger.warn(
        `[auto-import] Movie "${mediaNaming.title}" has ${videoFiles.length} video files — skipping auto-import`,
      );
      await createNotification(
        { repo: deps.notifications },
        {
          title: "Movie import skipped",
          message: `"${mediaNaming.title}" has ${videoFiles.length} video files — expected a single file for movies.`,
          type: "movie_multi_file",
          mediaId: mediaRow.id,
        },
      );
      return result;
    }

    let primarySeasonNumber = torrentRow.seasonNumber ?? undefined;
    if (!primarySeasonNumber && mediaRow.type === "show") {
      const firstVideoName = videoFiles[0]?.name ?? "";
      const match = EP_PATTERN.exec(firstVideoName);
      const seasonRaw = match?.[1];
      primarySeasonNumber =
        seasonRaw !== undefined ? parseInt(seasonRaw, 10) : 1;
    }

    const parsedFiles = parseVideoFiles(
      videoFiles,
      mediaRow,
      mediaNaming,
      torrentRow,
      primarySeasonNumber,
    );

    if (parsedFiles.length === 0) {
      deps.logger.warn(
        `[auto-import] No valid files to import for "${mediaNaming.title}" — all episodes unresolvable`,
      );
      return result;
    }

    const mediaDir = buildMediaDir(mediaNaming, primarySeasonNumber);

    let importedCount: number;
    let contentPath: string;

    if (importMethod === "local") {
      const libraryPath = libRow?.libraryPath;
      if (!libraryPath) {
        deps.logger.error(
          `[auto-import] No library path configured for "${mediaNaming.title}" — configure paths in Settings > Downloads`,
        );
        await createNotification(
          { repo: deps.notifications },
          {
            title: "Import failed — paths not configured",
            message: `No library path set for "${mediaNaming.title}". Go to Settings > Downloads to configure your paths.`,
            type: "import_failed",
            mediaId: mediaRow.id,
          },
        );
        return result;
      }
      const targetDir = path.join(libraryPath, mediaDir);

      try {
        await deps.fs.mkdir(targetDir, { recursive: true });
      } catch (err) {
        deps.logger.error(
          `[auto-import] Failed to create target dir "${targetDir}"`,
          { error: err instanceof Error ? err.message : String(err) },
        );
        return result;
      }

      let savePath: string;
      try {
        savePath = await resolveSavePath(client, torrentRow.hash);
      } catch (err) {
        deps.logger.error(
          `[auto-import] Failed to resolve save path for "${torrentRow.title}"`,
          { error: err instanceof Error ? err.message : String(err) },
        );
        return result;
      }

      importedCount = await importLocalVideoFiles(
        {
          fs: deps.fs,
          logger: deps.logger,
          notifications: deps.notifications,
          torrents: deps.torrents,
        },
        parsedFiles,
        savePath,
        targetDir,
        libraryPath,
        mediaNaming,
        primarySeasonNumber,
        placeholders,
        alreadyImported,
        mediaRow,
        torrentRow,
      );

      await importLocalSubtitleFiles(
        { fs: deps.fs, logger: deps.logger },
        subtitleFiles,
        savePath,
        targetDir,
        libraryPath,
        mediaRow,
        mediaNaming,
        torrentRow,
        primarySeasonNumber,
      );

      contentPath = targetDir;
    } else {
      const libraryBasePath = libRow?.libraryPath;
      if (!libraryBasePath) {
        deps.logger.error(
          `[auto-import] No library path configured for "${mediaNaming.title}" — configure paths in Settings > Downloads`,
        );
        await createNotification(
          { repo: deps.notifications },
          {
            title: "Import failed — paths not configured",
            message: `No library path set for "${mediaNaming.title}". Go to Settings > Downloads to configure your paths.`,
            type: "import_failed",
            mediaId: mediaRow.id,
          },
        );
        return result;
      }
      const qbitBasePath = libRow.downloadPath ?? libraryBasePath;
      const qbitTargetLocation = `${qbitBasePath}/${mediaDir}`;
      const libraryTargetLocation = `${libraryBasePath}/${mediaDir}`;

      try {
        await deps.fs.mkdir(libraryTargetLocation, { recursive: true });
      } catch (err) {
        deps.logger.error(
          `[auto-import] Failed to create target dir "${libraryTargetLocation}"`,
          { error: err instanceof Error ? err.message : String(err) },
        );
        return result;
      }

      const remoteResult = await importRemoteVideoFiles(
        {
          client,
          notifications: deps.notifications,
          torrents: deps.torrents,
          logger: deps.logger,
        },
        parsedFiles,
        torrentRow.hash,
        qbitTargetLocation,
        libraryTargetLocation,
        placeholders,
        alreadyImported,
        mediaRow,
        torrentRow,
        files,
      );
      importedCount = remoteResult.importedCount;

      const freshSubtitleFiles = remoteResult.postMoveFiles
        .filter((f) => isSubtitleFile(f.name))
        .map((f) => ({ name: f.name, size: f.size }));

      await importRemoteSubtitleFiles(
        { client, logger: deps.logger },
        freshSubtitleFiles,
        torrentRow.hash,
        mediaRow,
        mediaNaming,
        torrentRow,
        primarySeasonNumber,
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
      try {
        result.mediaFiles = await deps.torrents.findMediaFilesByMediaId(
          mediaRow.id,
        );
      } catch (err) {
        deps.logger.error(
          `[auto-import] Failed to load media files for ${mediaRow.id}`,
          { error: err instanceof Error ? err.message : String(err) },
        );
      }

      deps.logger.info?.(
        `[auto-import] [${importMethod}] Imported ${importedCount}/${totalExpected} file(s) for "${mediaNaming.title}"`,
      );
      hooks?.onImported?.({
        ...mediaRow,
        title: mediaNaming.title,
        libraryId: mediaRow.libraryId ?? null,
      });
      await createNotification(
        { repo: deps.notifications },
        {
          title: "Import complete",
          message: `Imported ${importedCount} file(s) for "${mediaNaming.title}"`,
          type: "import_success",
          mediaId: mediaRow.id,
        },
      );
    } else {
      const newAttempts = torrentRow.importAttempts + 1;
      downloadUpdate.importAttempts = newAttempts;

      deps.logger.warn(
        `[auto-import] [${importMethod}] Partial import: ${importedCount}/${totalExpected} file(s) for "${mediaNaming.title}" — will retry (attempt ${newAttempts}/${MAX_IMPORT_ATTEMPTS})`,
      );

      if (newAttempts >= MAX_IMPORT_ATTEMPTS) {
        await createNotification(
          { repo: deps.notifications },
          {
            title: "Import failed",
            message: `Failed to import "${mediaNaming.title}" after ${newAttempts} attempts. Check your library paths in Settings > Downloads or try importing manually.`,
            type: "import_failed",
            mediaId: mediaRow.id,
          },
        );
      } else if (importedCount > 0) {
        await createNotification(
          { repo: deps.notifications },
          {
            title: "Partial import",
            message: `Imported ${importedCount} of ${totalExpected} file(s) for "${mediaNaming.title}". Will retry remaining files.`,
            type: "import_failed",
            mediaId: mediaRow.id,
          },
        );
      } else if (newAttempts === 1) {
        await createNotification(
          { repo: deps.notifications },
          {
            title: "Import retry",
            message: `Could not import "${mediaNaming.title}" — will retry. If this persists, check your library and download paths in Settings > Downloads.`,
            type: "import_warning",
            mediaId: mediaRow.id,
          },
        );
      }
    }
  } catch (err) {
    deps.logger.error(
      `[auto-import] Unexpected error for "${torrentRow.title}"`,
      { error: err instanceof Error ? err.message : String(err) },
    );
  } finally {
    try {
      await deps.torrents.updateDownload(torrentRow.id, downloadUpdate);
    } catch (err) {
      deps.logger.error(
        `[auto-import] Failed to persist download update for ${torrentRow.id}`,
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  return result;
}
