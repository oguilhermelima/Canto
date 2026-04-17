import path from "node:path";

import type { Database } from "@canto/db/client";
import type { torrent as torrentSchema } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import type { DownloadClientPort, TorrentFileInfo } from "../ports/download-client";
import type { FileSystemPort } from "../ports/file-system.port";
import { isVideoFile, buildMediaDir } from "../rules/naming";
import { EP_PATTERN, isSubtitleFile } from "../rules/parsing";
import { getEffectiveProviderSync } from "../rules/effective-provider";
import { createNotification } from "./create-notification";
import {
  findMediaByIdWithSeasons,
  findFolderById,
  findDefaultFolder,
  findMediaFilesByTorrentId,
  updateMediaFile,
  createMediaFileNoConflict,
  updateTorrent,
  findNotificationByTypeAndMedia,
} from "../../infrastructure/repositories";
import {
  type ParsedFile,
  buildSubtitleName,
  parseVideoFiles,
} from "../../infrastructure/adapters/filesystem";

export interface ImportHooks {
  onImported?: (mediaRow: { id: string; title: string; externalId: number; provider: string; type: string; libraryId: string | null }) => void;
}

type ImportMethod = "local" | "remote";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveSavePath(
  client: DownloadClientPort,
  hash: string,
): Promise<string> {
  const torrents = await client.listTorrents({ hashes: [hash] });
  const torrent = torrents[0];
  if (!torrent) throw new Error(`Torrent ${hash} not found in download client`);
  return path.normalize(torrent.save_path);
}

// ── Local import (hardlinks) ────────────────────────────────────────────────

async function importLocalVideoFiles(
  parsedFiles: ParsedFile[],
  savePath: string,
  targetDir: string,
  libraryPath: string,
  mediaNaming: { title: string; year: number | null; externalId: number; provider: string; type: string },
  primarySeasonNumber: number | undefined,
  placeholders: Array<{ id: string; episodeId: string | null }>,
  alreadyImported: Array<{ id: string; episodeId: string | null }>,
  db: Database,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
  fs: FileSystemPort,
): Promise<number> {
  let importedCount = 0;
  const linkedPaths = new Set<string>();
  let crossFsNotified = false;

  for (const pf of parsedFiles) {
    try {
      let fileTargetDir = targetDir;
      if (pf.seasonNumber !== undefined && pf.seasonNumber !== primarySeasonNumber) {
        const altMediaDir = buildMediaDir(mediaNaming, pf.seasonNumber);
        fileTargetDir = path.join(libraryPath, altMediaDir);
        try {
          await fs.mkdir(fileTargetDir, { recursive: true });
        } catch (mkErr) {
          const code = (mkErr as NodeJS.ErrnoException).code;
          console.error(
            `[auto-import] mkdir failed for "${fileTargetDir}" (${code}) — file "${pf.file.name}" will be skipped`,
          );
          throw mkErr;
        }
      }

      const sourcePath = path.join(savePath, pf.file.name);
      const targetPath = path.join(fileTargetDir, pf.targetFilename);

      if (!linkedPaths.has(targetPath)) {
        const method = await fs.hardlinkOrCopy(sourcePath, targetPath);
        console.log(`[auto-import] ${method}: ${sourcePath} → ${targetPath}`);
        linkedPaths.add(targetPath);

        if (method === "copy" && !crossFsNotified) {
          crossFsNotified = true;
          const existing = await findNotificationByTypeAndMedia(db, "cross_filesystem_warning", mediaRow.id);
          if (!existing) {
            await createNotification(db, {
              title: "Cross-filesystem copy",
              message: `Files are being copied instead of hardlinked (different filesystems). This uses double disk space.`,
              type: "cross_filesystem_warning",
              mediaId: mediaRow.id,
            });
          }
        }
      }

      importedCount += await upsertMediaFile(db, pf, targetPath, placeholders, alreadyImported, mediaRow, torrentRow);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      console.error(
        `[auto-import] File error "${pf.file.name}"${code ? ` (${code})` : ""}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return importedCount;
}

async function importLocalSubtitleFiles(
  subtitleFiles: Array<{ name: string; size: number }>,
  savePath: string,
  targetDir: string,
  libraryPath: string,
  mediaRow: { type: string },
  mediaNaming: { title: string; year: number | null; externalId: number; provider: string; type: string },
  torrentRow: { title: string; quality: string; source: string },
  primarySeasonNumber: number | undefined,
  fs: FileSystemPort,
): Promise<void> {
  for (const sf of subtitleFiles) {
    try {
      const targetSubName = buildSubtitleName(sf.name, mediaRow, mediaNaming, torrentRow, primarySeasonNumber);
      if (targetSubName) {
        // Determine correct directory for multi-season subtitle files
        let fileTargetDir = targetDir;
        if (mediaRow.type === "show") {
          const epMatch = EP_PATTERN.exec(sf.name);
          if (epMatch) {
            const subSeasonNum = parseInt(epMatch[1]!, 10);
            if (subSeasonNum !== primarySeasonNumber) {
              const altMediaDir = buildMediaDir(mediaNaming, subSeasonNum);
              fileTargetDir = path.join(libraryPath, altMediaDir);
              await fs.mkdir(fileTargetDir, { recursive: true });
            }
          }
        }

        const sourcePath = path.join(savePath, sf.name);
        const targetPath = path.join(fileTargetDir, targetSubName);
        const method = await fs.hardlinkOrCopy(sourcePath, targetPath);
        console.log(`[auto-import] Subtitle ${method}: ${sf.name} → ${targetSubName}`);
      }
    } catch {
      // Non-critical
    }
  }
}

// ── Remote import (qBit API) ────────────────────────────────────────────────

async function importRemoteVideoFiles(
  parsedFiles: ParsedFile[],
  client: DownloadClientPort,
  hash: string,
  targetLocation: string,
  libRow: { libraryPath: string | null } | null,
  placeholders: Array<{ id: string; episodeId: string | null }>,
  alreadyImported: Array<{ id: string; episodeId: string | null }>,
  db: Database,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
  originalFiles: TorrentFileInfo[],
): Promise<number> {
  // Match each parsed file against the PRE-MOVE torrent file list so we can
  // rename the files in place BEFORE asking qBit to move them. Renaming is
  // instant (it just changes the internal path within the torrent), whereas
  // setLocation can take minutes for cross-filesystem moves of large files.
  // Doing the rename first eliminates the window in which the file exists at
  // the destination with its raw torrent name — otherwise Jellyfin's scheduled
  // scan may pick up that intermediate name and create a phantom entry.
  const matchForPf = new Map<ParsedFile, TorrentFileInfo>();

  for (const pf of parsedFiles) {
    const pfBasename = pf.file.name.substring(pf.file.name.lastIndexOf("/") + 1);
    const pfExt = pf.extension.toLowerCase();

    // Tier 1: exact size + same extension
    const sizeAndExtMatches = originalFiles.filter(
      (of) => of.size === pf.file.size && of.name.toLowerCase().endsWith(pfExt),
    );
    let match: TorrentFileInfo | undefined;
    if (sizeAndExtMatches.length === 1) {
      match = sizeAndExtMatches[0];
    } else if (sizeAndExtMatches.length > 1) {
      // Tier 2: among size+ext matches, prefer one whose basename contains the original name
      match = sizeAndExtMatches.find((of) =>
        of.name.substring(of.name.lastIndexOf("/") + 1).includes(pfBasename),
      ) ?? sizeAndExtMatches[0];
      console.warn(
        `[auto-import] Ambiguous file match for "${pfBasename}" — ${sizeAndExtMatches.length} candidates, using "${match?.name}"`,
      );
    } else {
      // Tier 3: fall back to size-only match
      const sizeMatch = originalFiles.find((of) => of.size === pf.file.size);
      if (sizeMatch) {
        console.warn(
          `[auto-import] Weak file match (size only) for "${pfBasename}" → "${sizeMatch.name}"`,
        );
      }
      match = sizeMatch;
    }

    if (!match) {
      console.warn(`[auto-import] No torrent file matched for "${pfBasename}"`);
      continue;
    }

    matchForPf.set(pf, match);
  }

  // Dedupe rename operations by original name: multi-episode files produce
  // multiple ParsedFile entries that all point at the same physical torrent
  // file and share the same targetFilename.
  const renameOps = new Map<string, string>();
  for (const [pf, match] of matchForPf) {
    if (match.name !== pf.targetFilename && !renameOps.has(match.name)) {
      renameOps.set(match.name, pf.targetFilename);
    }
  }

  // Track the post-rename name for every original name we touched. If rename
  // fails we fall back to the original name and still let the move proceed —
  // the data will land in the right directory even if the filename is stale.
  const renamedByOriginal = new Map<string, string>();
  for (const [oldPath, newPath] of renameOps) {
    try {
      await client.renameFile(hash, oldPath, newPath);
      renamedByOriginal.set(oldPath, newPath);
      console.log(`[auto-import] Renamed "${oldPath}" → "${newPath}"`);
    } catch (err) {
      console.warn(
        `[auto-import] renameFile failed for "${oldPath}": ${err instanceof Error ? err.message : err} — proceeding with move using original name`,
      );
      renamedByOriginal.set(oldPath, oldPath);
      await createNotification(db, {
        title: "File rename failed",
        message: `Could not rename "${oldPath.substring(oldPath.lastIndexOf("/") + 1)}" during import. The file is using its original name.`,
        type: "import_warning",
        mediaId: mediaRow.id,
      });
    }
  }

  // Now move the torrent to the final location. Because the rename already
  // happened, qBit moves each file to `targetLocation/<final name>`.
  try {
    await client.setLocation(hash, targetLocation);
    console.log(`[auto-import] Remote move → ${targetLocation}`);
  } catch (err) {
    console.error(`[auto-import] setLocation failed:`, err instanceof Error ? err.message : err);
    return 0;
  }

  // Poll until qBittorrent has finished moving files to the new location.
  // Cross-filesystem moves of large torrents can take several minutes, so we
  // watch the torrent state (qBit reports "moving") with a hard 30-minute cap
  // to avoid infinite loops if qBit gets stuck.
  const MAX_MOVE_MS = 30 * 60 * 1000;
  const POLL_INTERVAL_MS = 3000;
  const deadline = Date.now() + MAX_MOVE_MS;
  const normalizedTarget = path.normalize(targetLocation);

  let moved = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const torrents = await client.listTorrents({ hashes: [hash] });
    const info = torrents[0];
    if (!info) continue;

    const savePathMatches = path.normalize(info.save_path).startsWith(normalizedTarget);
    if (savePathMatches && info.state !== "moving") {
      moved = true;
      break;
    }
  }

  if (!moved) {
    console.error(
      `[auto-import] Remote move did not complete within ${MAX_MOVE_MS / 60000} minutes — files may not have moved to "${targetLocation}"`,
    );
    return 0;
  }

  // Warn if any file is still under a subfolder after rename+move. Sibling
  // files of nested releases (samples, .nfo, .txt) cannot be cleaned up from
  // the worker — filesystem cleanup is intentionally out of scope here.
  try {
    const finalFiles = await client.getTorrentFiles(hash);
    const nested = finalFiles.filter((f) => f.name.includes("/"));
    if (nested.length > 0) {
      console.warn(
        `[auto-import] Torrent ${hash} still has ${nested.length} file(s) under subfolders after import: ${nested.map((f) => f.name).join(", ")}`,
      );
    }
  } catch {
    // Non-critical
  }

  // Upsert media_file rows. finalPath is derived from the already-known
  // target location and the renamed filename — no need to re-fetch from qBit.
  let importedCount = 0;
  for (const [pf, match] of matchForPf) {
    try {
      const finalName = renamedByOriginal.get(match.name) ?? match.name;
      const finalPath = `${targetLocation}/${finalName}`;
      importedCount += await upsertMediaFile(
        db,
        pf,
        finalPath,
        placeholders,
        alreadyImported,
        mediaRow,
        torrentRow,
      );
    } catch (err) {
      console.error(`[auto-import] File error "${pf.file.name}":`, err instanceof Error ? err.message : err);
    }
  }

  return importedCount;
}

async function importRemoteSubtitleFiles(
  subtitleFiles: Array<{ name: string; size: number }>,
  client: DownloadClientPort,
  hash: string,
  mediaRow: { type: string },
  mediaNaming: { title: string; year: number | null; externalId: number; provider: string; type: string },
  torrentRow: { title: string; quality: string; source: string },
  primarySeasonNumber: number | undefined,
): Promise<void> {
  for (const sf of subtitleFiles) {
    try {
      const targetSubName = buildSubtitleName(sf.name, mediaRow, mediaNaming, torrentRow, primarySeasonNumber);
      if (targetSubName) {
        try {
          await client.renameFile(hash, sf.name, targetSubName);
          console.log(`[auto-import] Renamed subtitle: ${sf.name} → ${targetSubName}`);
        } catch {
          console.warn(`[auto-import] renameFile failed for subtitle "${sf.name}"`);
        }
      }
    } catch {
      // Non-critical
    }
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

async function upsertMediaFile(
  db: Database,
  pf: ParsedFile,
  finalPath: string,
  placeholders: Array<{ id: string; episodeId: string | null }>,
  alreadyImported: Array<{ id: string; episodeId: string | null }>,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
): Promise<number> {
  // Skip files that were already imported on a previous attempt (prevents duplicates on retry)
  if (pf.episodeId) {
    const existing = alreadyImported.find((f) => f.episodeId === pf.episodeId);
    if (existing) return 1;
  } else {
    const existing = alreadyImported.find((f) => !f.episodeId);
    if (existing) return 1;
  }

  if (pf.episodeId) {
    const placeholder = placeholders.find((p) => p.episodeId === pf.episodeId);
    if (placeholder) {
      await updateMediaFile(db, placeholder.id, {
        filePath: finalPath,
        sizeBytes: pf.file.size,
        status: "imported",
      });
      return 1;
    }
    await createMediaFileNoConflict(db, {
      mediaId: mediaRow.id,
      episodeId: pf.episodeId,
      torrentId: torrentRow.id,
      filePath: finalPath,
      quality: torrentRow.quality,
      source: torrentRow.source,
      sizeBytes: pf.file.size,
      status: "imported",
    });
    return 1;
  }

  if (mediaRow.id) {
    const placeholder = placeholders.find((p) => !p.episodeId);
    if (placeholder) {
      await updateMediaFile(db, placeholder.id, {
        filePath: finalPath,
        sizeBytes: pf.file.size,
        status: "imported",
      });
      return 1;
    }
    // No placeholder found for this movie — create a new media_file record
    await createMediaFileNoConflict(db, {
      mediaId: mediaRow.id,
      torrentId: torrentRow.id,
      filePath: finalPath,
      quality: torrentRow.quality,
      source: torrentRow.source,
      sizeBytes: pf.file.size,
      status: "imported",
    });
    return 1;
  }

  return 0;
}

// ── Main import ─────────────────────────────────────────────────────────────

export async function autoImportTorrent(
  db: Database,
  torrentRow: typeof torrentSchema.$inferSelect,
  client: DownloadClientPort,
  deps: { fs: FileSystemPort },
  hooks?: ImportHooks,
): Promise<void> {
  if (!torrentRow.hash || !torrentRow.mediaId) {
    await updateTorrent(db, torrentRow.id, { importing: false });
    return;
  }

  try {
  const mediaRow = await findMediaByIdWithSeasons(db, torrentRow.mediaId);
  if (!mediaRow) {
    await updateTorrent(db, torrentRow.id, { importing: false });
    return;
  }

  const placeholders = await findMediaFilesByTorrentId(db, torrentRow.id, "pending");
  const alreadyImported = await findMediaFilesByTorrentId(db, torrentRow.id, "imported");

  // ── Determine import method ──

  const rawMethod = (await getSetting("download.importMethod")) ?? "local";
  const importMethod: ImportMethod = rawMethod === "remote" ? "remote" : "local";

  // ── Resolve library ──

  const libRow = mediaRow.libraryId
    ? await findFolderById(db, mediaRow.libraryId)
    : await findDefaultFolder(db);

  // ── Get files from download client ──

  const files = await client.getTorrentFiles(torrentRow.hash);
  const videoFiles = files.filter((f) => isVideoFile(f.name));
  const subtitleFiles = files.filter((f) => isSubtitleFile(f.name));

  if (videoFiles.length === 0) {
    await updateTorrent(db, torrentRow.id, { importing: false });
    return;
  }

  // Movie validation
  if (mediaRow.type === "movie" && videoFiles.length > 1) {
    console.warn(
      `[auto-import] Movie "${mediaRow.title}" has ${videoFiles.length} video files — skipping auto-import`,
    );
    await createNotification(db, {
      title: "Movie import skipped",
      message: `"${mediaRow.title}" has ${videoFiles.length} video files — expected a single file for movies.`,
      type: "movie_multi_file",
      mediaId: mediaRow.id,
    });
    await updateTorrent(db, torrentRow.id, { importing: false });
    return;
  }

  const globalTvdbEnabled =
    (await getSetting("tvdb.defaultShows")) === true;
  const effectiveProvider = getEffectiveProviderSync(mediaRow, globalTvdbEnabled);
  const namingExternalId =
    effectiveProvider === "tvdb" && mediaRow.tvdbId
      ? mediaRow.tvdbId
      : mediaRow.externalId;

  const mediaNaming = {
    title: mediaRow.title,
    year: mediaRow.year,
    externalId: namingExternalId,
    provider: effectiveProvider,
    type: mediaRow.type,
  };

  // ── Determine primary season number ──

  let primarySeasonNumber = torrentRow.seasonNumber ?? undefined;
  if (!primarySeasonNumber && mediaRow.type === "show") {
    const match = EP_PATTERN.exec(videoFiles[0]?.name ?? "");
    if (match) {
      primarySeasonNumber = parseInt(match[1]!, 10);
    } else {
      primarySeasonNumber = 1;
    }
  }

  // ── Parse all video files (shared between modes) ──

  const parsedFiles = parseVideoFiles(videoFiles, mediaRow, mediaNaming, torrentRow, primarySeasonNumber);

  if (parsedFiles.length === 0) {
    console.warn(`[auto-import] No valid files to import for "${mediaRow.title}" — all episodes unresolvable`);
    await updateTorrent(db, torrentRow.id, { importing: false });
    return;
  }

  const mediaDir = buildMediaDir(mediaNaming, primarySeasonNumber);

  // ── Import based on method ──

  let importedCount: number;
  let contentPath: string;

  if (importMethod === "local") {
    // Local: hardlink from download dir → library dir (app-side fs operations)
    const libraryPath = libRow?.libraryPath;
    if (!libraryPath) {
      console.error(`[auto-import] No library path configured for "${mediaRow.title}" — configure paths in Settings > Downloads`);
      await createNotification(db, {
        title: "Import failed — paths not configured",
        message: `No library path set for "${mediaRow.title}". Go to Settings > Downloads to configure your paths.`,
        type: "import_failed",
        mediaId: mediaRow.id,
      });
      await updateTorrent(db, torrentRow.id, { importing: false });
      return;
    }
    const targetDir = path.join(libraryPath, mediaDir);

    try {
      await deps.fs.mkdir(targetDir, { recursive: true });
    } catch (err) {
      console.error(`[auto-import] Failed to create target dir "${targetDir}":`, err);
      await updateTorrent(db, torrentRow.id, { importing: false });
      return;
    }

    let savePath: string;
    try {
      savePath = await resolveSavePath(client, torrentRow.hash);
    } catch (err) {
      console.error(`[auto-import] Failed to resolve save path for "${torrentRow.title}":`, err instanceof Error ? err.message : err);
      await updateTorrent(db, torrentRow.id, { importing: false });
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
    // Remote: move + rename via download client API (no filesystem access needed)
    const containerBasePath = libRow?.libraryPath;
    if (!containerBasePath) {
      console.error(`[auto-import] No library path configured for "${mediaRow.title}" — configure paths in Settings > Downloads`);
      await createNotification(db, {
        title: "Import failed — paths not configured",
        message: `No library path set for "${mediaRow.title}". Go to Settings > Downloads to configure your paths.`,
        type: "import_failed",
        mediaId: mediaRow.id,
      });
      await updateTorrent(db, torrentRow.id, { importing: false });
      return;
    }
    const targetLocation = `${containerBasePath}/${mediaDir}`;

    importedCount = await importRemoteVideoFiles(
      parsedFiles, client, torrentRow.hash, targetLocation,
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

    contentPath = targetLocation;
  }

  // ── Finalize ──

  const totalExpected = videoFiles.length;
  const allImported = importedCount >= totalExpected;

  if (allImported) {
    await updateTorrent(db, torrentRow.id, {
      imported: true,
      importing: false,
      importMethod,
      contentPath,
    });

    console.log(`[auto-import] [${importMethod}] Imported ${importedCount}/${totalExpected} file(s) for "${mediaRow.title}"`);
    hooks?.onImported?.(mediaRow);
    await createNotification(db, {
      title: "Import complete",
      message: `Imported ${importedCount} file(s) for "${mediaRow.title}"`,
      type: "import_success",
      mediaId: mediaRow.id,
    });
  } else {
    // Partial import — leave imported=false so the worker retries on next cycle.
    // Increment importAttempts for linear backoff (10min * attempts).
    const newAttempts = (torrentRow.importAttempts ?? 0) + 1;
    await updateTorrent(db, torrentRow.id, {
      importing: false,
      importMethod,
      contentPath,
      importAttempts: newAttempts,
    });

    console.warn(
      `[auto-import] [${importMethod}] Partial import: ${importedCount}/${totalExpected} file(s) for "${mediaRow.title}" — will retry (attempt ${newAttempts}/5)`,
    );

    if (newAttempts >= 5) {
      // Max retries reached — notify the user and give up
      await createNotification(db, {
        title: "Import failed",
        message: `Failed to import "${mediaRow.title}" after ${newAttempts} attempts. Check your library paths in Settings > Downloads or try importing manually.`,
        type: "import_failed",
        mediaId: mediaRow.id,
      });
    } else if (importedCount > 0) {
      await createNotification(db, {
        title: "Partial import",
        message: `Imported ${importedCount} of ${totalExpected} file(s) for "${mediaRow.title}". Will retry remaining files.`,
        type: "import_failed",
        mediaId: mediaRow.id,
      });
    }
  }
  } catch (err) {
    console.error(`[auto-import] Unexpected error for "${torrentRow.title}":`, err instanceof Error ? err.message : err);
    await updateTorrent(db, torrentRow.id, { importing: false });
  }
}
