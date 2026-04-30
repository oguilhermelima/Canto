import path from "node:path";

import type { Database } from "@canto/db/client";
import type { download as downloadSchema } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import type { DownloadClientPort } from "../../shared/ports/download-client";
import type { FileSystemPort } from "../../shared/ports/file-system.port";
import { isVideoFile, buildMediaDir } from "../../shared/rules/naming";
import { EP_PATTERN, isSubtitleFile } from "../rules/parsing";
import { getEffectiveProviderSync } from "../../shared/rules/effective-provider";
import { createNotification } from "../../notifications/use-cases/create-notification";
import {
  findMediaByIdWithSeasons,
  findFolderById,
  findDefaultFolder,
  findMediaFilesByDownloadId,
  updateDownload,
} from "../../../infra/repositories";
import { findMediaLocalized } from "../../../infra/media/media-localized-repository";
import { parseVideoFiles } from "../../../platform/fs/filesystem";

import { resolveSavePath } from "./import-torrent/shared";
import { importLocalVideoFiles, importLocalSubtitleFiles } from "./import-torrent/local";
import { importRemoteVideoFiles, importRemoteSubtitleFiles } from "./import-torrent/remote";

export { resolveSavePath, upsertMediaFile } from "./import-torrent/shared";
export { importLocalVideoFiles, importLocalSubtitleFiles } from "./import-torrent/local";
export { importRemoteVideoFiles, importRemoteSubtitleFiles } from "./import-torrent/remote";

export interface ImportHooks {
  onImported?: (mediaRow: { id: string; title: string; externalId: number; provider: string; type: string; libraryId: string | null }) => void;
}

type ImportMethod = "local" | "remote";

export async function autoImportTorrent(
  db: Database,
  torrentRow: typeof downloadSchema.$inferSelect,
  client: DownloadClientPort,
  deps: { fs: FileSystemPort },
  hooks?: ImportHooks,
): Promise<void> {
  if (!torrentRow.hash || !torrentRow.mediaId) {
    await updateDownload(db, torrentRow.id, { importing: false });
    return;
  }

  try {
    const mediaRow = await findMediaByIdWithSeasons(db, torrentRow.mediaId);
    if (!mediaRow) {
      await updateDownload(db, torrentRow.id, { importing: false });
      return;
    }

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
    const globalTvdbEnabled = (await getSetting("tvdb.defaultShows")) === true;
    const effectiveProvider = getEffectiveProviderSync(mediaRow, globalTvdbEnabled);
    const namingExternalId =
      effectiveProvider === "tvdb" && mediaRow.tvdbId
        ? mediaRow.tvdbId
        : mediaRow.externalId;

    const mediaNaming = {
      title: enLoc?.title ?? "",
      year: mediaRow.year,
      externalId: namingExternalId,
      provider: effectiveProvider,
      type: mediaRow.type,
    };

    const files = await client.getTorrentFiles(torrentRow.hash);
    const videoFiles = files.filter((f) => isVideoFile(f.name));
    const subtitleFiles = files.filter((f) => isSubtitleFile(f.name));

    if (videoFiles.length === 0) {
      await updateDownload(db, torrentRow.id, { importing: false });
      return;
    }

    if (mediaRow.type === "movie" && videoFiles.length > 1) {
      console.warn(
        `[auto-import] Movie "${mediaNaming.title}" has ${videoFiles.length} video files — skipping auto-import`,
      );
      await createNotification(db, {
        title: "Movie import skipped",
        message: `"${mediaNaming.title}" has ${videoFiles.length} video files — expected a single file for movies.`,
        type: "movie_multi_file",
        mediaId: mediaRow.id,
      });
      await updateDownload(db, torrentRow.id, { importing: false });
      return;
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
      await updateDownload(db, torrentRow.id, { importing: false });
      return;
    }

    const mediaDir = buildMediaDir(mediaNaming, primarySeasonNumber);

    let importedCount: number;
    let contentPath: string;

    if (importMethod === "local") {
      const libraryPath = libRow?.libraryPath;
      if (!libraryPath) {
        console.error(`[auto-import] No library path configured for "${mediaNaming.title}" — configure paths in Settings > Downloads`);
        await createNotification(db, {
          title: "Import failed — paths not configured",
          message: `No library path set for "${mediaNaming.title}". Go to Settings > Downloads to configure your paths.`,
          type: "import_failed",
          mediaId: mediaRow.id,
        });
        await updateDownload(db, torrentRow.id, { importing: false });
        return;
      }
      const targetDir = path.join(libraryPath, mediaDir);

      try {
        await deps.fs.mkdir(targetDir, { recursive: true });
      } catch (err) {
        console.error(`[auto-import] Failed to create target dir "${targetDir}":`, err);
        await updateDownload(db, torrentRow.id, { importing: false });
        return;
      }

      let savePath: string;
      try {
        savePath = await resolveSavePath(client, torrentRow.hash);
      } catch (err) {
        console.error(`[auto-import] Failed to resolve save path for "${torrentRow.title}":`, err instanceof Error ? err.message : err);
        await updateDownload(db, torrentRow.id, { importing: false });
        return;
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
        await createNotification(db, {
          title: "Import failed — paths not configured",
          message: `No library path set for "${mediaNaming.title}". Go to Settings > Downloads to configure your paths.`,
          type: "import_failed",
          mediaId: mediaRow.id,
        });
        await updateDownload(db, torrentRow.id, { importing: false });
        return;
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
        await updateDownload(db, torrentRow.id, { importing: false });
        return;
      }

      importedCount = await importRemoteVideoFiles(
        parsedFiles, client, torrentRow.hash, qbitTargetLocation, libraryTargetLocation,
        libRow ?? null, placeholders, alreadyImported, db, mediaRow, torrentRow, files,
      );

      // Re-fetch file list after remote move — the original subtitleFiles have
      // stale pre-move paths that would cause renameFile to fail.
      const movedAllFiles = await client.getTorrentFiles(torrentRow.hash);
      const freshSubtitleFiles = movedAllFiles
        .filter((f) => isSubtitleFile(f.name))
        .map((f) => ({ name: f.name, size: f.size }));

      await importRemoteSubtitleFiles(
        freshSubtitleFiles, client, torrentRow.hash, mediaRow, mediaNaming, torrentRow, primarySeasonNumber,
      );

      contentPath = libraryTargetLocation;
    }

    const totalExpected = videoFiles.length;
    const allImported = importedCount >= totalExpected;

    if (allImported) {
      await updateDownload(db, torrentRow.id, {
        imported: true,
        importing: false,
        importMethod,
        contentPath,
      });

      console.log(`[auto-import] [${importMethod}] Imported ${importedCount}/${totalExpected} file(s) for "${mediaNaming.title}"`);
      hooks?.onImported?.({
        ...mediaRow,
        title: mediaNaming.title,
        libraryId: mediaRow.libraryId ?? null,
      });
      await createNotification(db, {
        title: "Import complete",
        message: `Imported ${importedCount} file(s) for "${mediaNaming.title}"`,
        type: "import_success",
        mediaId: mediaRow.id,
      });
    } else {
      const newAttempts = (torrentRow.importAttempts ?? 0) + 1;
      await updateDownload(db, torrentRow.id, {
        importing: false,
        importMethod,
        contentPath,
        importAttempts: newAttempts,
      });

      console.warn(
        `[auto-import] [${importMethod}] Partial import: ${importedCount}/${totalExpected} file(s) for "${mediaNaming.title}" — will retry (attempt ${newAttempts}/5)`,
      );

      if (newAttempts >= 5) {
        await createNotification(db, {
          title: "Import failed",
          message: `Failed to import "${mediaNaming.title}" after ${newAttempts} attempts. Check your library paths in Settings > Downloads or try importing manually.`,
          type: "import_failed",
          mediaId: mediaRow.id,
        });
      } else if (importedCount > 0) {
        await createNotification(db, {
          title: "Partial import",
          message: `Imported ${importedCount} of ${totalExpected} file(s) for "${mediaNaming.title}". Will retry remaining files.`,
          type: "import_failed",
          mediaId: mediaRow.id,
        });
      } else if (newAttempts === 1) {
        await createNotification(db, {
          title: "Import retry",
          message: `Could not import "${mediaNaming.title}" — will retry. If this persists, check your library and download paths in Settings > Downloads.`,
          type: "import_warning",
          mediaId: mediaRow.id,
        });
      }
    }
  } catch (err) {
    console.error(`[auto-import] Unexpected error for "${torrentRow.title}":`, err instanceof Error ? err.message : err);
    await updateDownload(db, torrentRow.id, { importing: false });
  }
}
