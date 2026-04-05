import { link, copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

import type { Database } from "@canto/db/client";
import type { torrent as torrentSchema } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import type { DownloadClientPort, TorrentFileInfo } from "../ports/download-client";
import { isVideoFile, sanitizeName, buildMediaDir, buildFileName } from "../rules/naming";
import { EP_PATTERN, BARE_EP_PATTERN, parseFileEpisodes, isSubtitleFile, parseSubtitleLanguage } from "../rules/parsing";
import { SETTINGS } from "../../lib/settings-keys";
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

export interface ImportHooks {
  onImported?: (mediaRow: { id: string; title: string; externalId: number; provider: string; type: string; libraryId: string | null }) => void;
}

type ImportMethod = "local" | "remote";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hardlinkOrCopy(source: string, target: string): Promise<"hardlink" | "copy" | "exists"> {
  try {
    await link(source, target);

    // Verify the hardlink actually shares the same inode (Docker/NFS can fail silently)
    const [srcStat, tgtStat] = await Promise.all([stat(source), stat(target)]);
    if (srcStat.ino !== tgtStat.ino) {
      // Hardlink failed silently — fall back to copy
      await copyFile(source, target);
      return "copy";
    }

    return "hardlink";
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      // Target already exists (e.g., re-import) — skip silently
      return "exists";
    }
    if (code === "EXDEV") {
      // Cross-filesystem — fall back to copy
      try {
        await copyFile(source, target);
        return "copy";
      } catch (cpErr: unknown) {
        if ((cpErr as NodeJS.ErrnoException).code === "EEXIST") return "exists";
        throw cpErr;
      }
    }
    throw err;
  }
}

async function resolveSavePath(
  client: DownloadClientPort,
  hash: string,
): Promise<string> {
  const torrents = await client.listTorrents({ hashes: [hash] });
  const torrent = torrents[0];
  if (!torrent) throw new Error(`Torrent ${hash} not found in download client`);
  return path.normalize(torrent.save_path);
}

interface ParsedFile {
  /** Original file info from client */
  file: { name: string; size: number };
  /** Parsed season number */
  seasonNumber: number | undefined;
  /** Parsed episode number */
  episodeNumber: number | undefined;
  /** Resolved episode ID from DB */
  episodeId: string | undefined;
  /** Target filename after rename */
  targetFilename: string;
  /** File extension */
  extension: string;
}

/**
 * Parse video files: extract episode info, resolve IDs, build target filenames.
 * This logic is shared between local and remote import modes.
 */
function parseVideoFiles(
  videoFiles: Array<{ name: string; size: number }>,
  mediaRow: {
    type: string;
    seasons?: Array<{ number: number; episodes?: Array<{ id: string; number: number; title: string | null }> }>;
  },
  mediaNaming: { title: string; year: number | null; externalId: number; provider: string; type: string },
  torrentRow: { title: string; quality: string; source: string },
  primarySeasonNumber: number | undefined,
): ParsedFile[] {
  const results: ParsedFile[] = [];

  for (const vf of videoFiles) {
    const ext = vf.name.substring(vf.name.lastIndexOf("."));

    if (mediaRow.type === "show") {
      const parsed = parseFileEpisodes(vf.name);
      const seasonNumber = parsed.season ?? primarySeasonNumber;

      if (parsed.episodes.length > 0) {
        // For each episode in the file, create a ParsedFile entry.
        // All entries share the same physical file but target different episode IDs.
        // Use the first episode number for the filename (e.g., S01E01-E03 style).
        const firstEp = parsed.episodes[0]!;
        const matchedSeason = seasonNumber !== undefined ? mediaRow.seasons?.find((s) => s.number === seasonNumber) : undefined;

        for (const epNum of parsed.episodes) {
          const matchedEp = matchedSeason?.episodes?.find((e) => e.number === epNum);

          if (!matchedEp) {
            console.warn(`[auto-import] Skipping S${String(seasonNumber ?? 0).padStart(2, "0")}E${String(epNum).padStart(2, "0")} — episode not found in database`);
            continue;
          }

          // Only the first episode gets the actual filename; others share the same file
          const targetFilename = buildFileName(mediaNaming, {
            seasonNumber,
            episodeNumber: firstEp,
            episodeTitle: matchedSeason?.episodes?.find((e) => e.number === firstEp)?.title ?? undefined,
            quality: torrentRow.quality,
            source: torrentRow.source,
            torrentTitle: torrentRow.title,
            extension: ext,
          });

          results.push({
            file: vf,
            seasonNumber,
            episodeNumber: epNum,
            episodeId: matchedEp.id,
            targetFilename,
            extension: ext,
          });
        }
      } else {
        // No episode number detected — skip to avoid orphaned media_file
        console.warn(`[auto-import] Skipping "${vf.name}" — no episode number detected for show`);
      }
    } else {
      // Movie
      results.push({
        file: vf,
        seasonNumber: undefined,
        episodeNumber: undefined,
        episodeId: undefined,
        targetFilename: buildFileName(mediaNaming, {
          quality: torrentRow.quality,
          source: torrentRow.source,
          torrentTitle: torrentRow.title,
          extension: ext,
        }),
        extension: ext,
      });
    }
  }

  return results;
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
        await mkdir(fileTargetDir, { recursive: true });
      }

      const sourcePath = path.join(savePath, pf.file.name);
      const targetPath = path.join(fileTargetDir, pf.targetFilename);

      if (!linkedPaths.has(targetPath)) {
        const method = await hardlinkOrCopy(sourcePath, targetPath);
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
      console.error(`[auto-import] File error "${pf.file.name}":`, err instanceof Error ? err.message : err);
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
              await mkdir(fileTargetDir, { recursive: true });
            }
          }
        }

        const sourcePath = path.join(savePath, sf.name);
        const targetPath = path.join(fileTargetDir, targetSubName);
        const method = await hardlinkOrCopy(sourcePath, targetPath);
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
  // Move torrent files to target directory via client API
  try {
    await client.setLocation(hash, targetLocation);
    console.log(`[auto-import] Remote move → ${targetLocation}`);
  } catch (err) {
    console.error(`[auto-import] setLocation failed:`, err instanceof Error ? err.message : err);
    return 0;
  }

  // Poll until qBittorrent has finished moving files to the new location.
  // We check the torrent's save_path (not file names, which are relative and don't change).
  let moved = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const torrents = await client.listTorrents({ hashes: [hash] });
    const info = torrents[0];
    if (info && path.normalize(info.save_path).startsWith(path.normalize(targetLocation))) {
      moved = true;
      break;
    }
  }

  if (!moved) {
    console.error(`[auto-import] Remote move did not complete after polling — files may not have moved to "${targetLocation}"`);
    return 0;
  }

  // Re-fetch file list after confirmed move
  let movedFiles = await client.getTorrentFiles(hash);

  let importedCount = 0;

  for (const pf of parsedFiles) {
    try {
      // Find matching moved file — match by size + extension first, then by position
      const pfBasename = pf.file.name.substring(pf.file.name.lastIndexOf("/") + 1);
      const pfExt = pf.extension.toLowerCase();

      // Tier 1: exact size + same extension
      const sizeAndExtMatches = movedFiles.filter(
        (mf) => mf.size === pf.file.size && mf.name.toLowerCase().endsWith(pfExt),
      );
      let movedFile: TorrentFileInfo | undefined;
      if (sizeAndExtMatches.length === 1) {
        movedFile = sizeAndExtMatches[0];
      } else if (sizeAndExtMatches.length > 1) {
        // Tier 2: among size+ext matches, prefer one whose basename contains the original name
        movedFile = sizeAndExtMatches.find((mf) =>
          mf.name.substring(mf.name.lastIndexOf("/") + 1).includes(pfBasename),
        ) ?? sizeAndExtMatches[0];
        console.warn(
          `[auto-import] Ambiguous file match for "${pfBasename}" — ${sizeAndExtMatches.length} candidates, using "${movedFile?.name}"`,
        );
      } else {
        // Tier 3: fall back to size-only match
        const sizeMatch = movedFiles.find((mf) => mf.size === pf.file.size);
        if (sizeMatch) {
          console.warn(
            `[auto-import] Weak file match (size only) for "${pfBasename}" → "${sizeMatch.name}"`,
          );
        }
        movedFile = sizeMatch;
      }

      if (!movedFile) continue;

      // Rename via client API
      let actualFilename = pf.targetFilename;
      if (movedFile.name !== pf.targetFilename) {
        try {
          await client.renameFile(hash, movedFile.name, pf.targetFilename);
        } catch {
          console.warn(`[auto-import] renameFile failed for "${movedFile.name}", skipping rename`);
          // Use the actual filename on disk since rename failed
          actualFilename = movedFile.name.substring(movedFile.name.lastIndexOf("/") + 1);
          await createNotification(db, {
            title: "File rename failed",
            message: `Could not rename "${actualFilename}" during import. The file is using its original name.`,
            type: "import_warning",
            mediaId: mediaRow.id,
          });
        }
      }

      // Compute host path using the actual filename (may differ from target if rename failed)
      const finalPath = `${targetLocation}/${actualFilename}`;

      importedCount += await upsertMediaFile(db, pf, finalPath, placeholders, alreadyImported, mediaRow, torrentRow);
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

function buildSubtitleName(
  fileName: string,
  mediaRow: { type: string },
  mediaNaming: { title: string; year: number | null; externalId: number; provider: string; type: string },
  torrentRow: { title: string; quality: string; source: string },
  primarySeasonNumber: number | undefined,
): string | undefined {
  const lang = parseSubtitleLanguage(fileName);
  const subExt = fileName.substring(fileName.lastIndexOf("."));
  const langSuffix = lang ? `.${lang}` : "";

  if (mediaRow.type === "show") {
    const epMatch = EP_PATTERN.exec(fileName);
    const bareMatch = !epMatch ? BARE_EP_PATTERN.exec(fileName) : null;
    const match = epMatch ?? bareMatch;
    if (match) {
      const epNum = parseInt(epMatch ? match[2]! : match[1]!, 10);
      const sNum = epMatch ? parseInt(epMatch[1]!, 10) : primarySeasonNumber;
      return buildFileName(mediaNaming, {
        seasonNumber: sNum,
        episodeNumber: epNum,
        quality: torrentRow.quality,
        source: torrentRow.source,
        torrentTitle: torrentRow.title,
        extension: `${langSuffix}${subExt}`,
      });
    }
    return undefined;
  }

  return buildFileName(mediaNaming, {
    quality: torrentRow.quality,
    source: torrentRow.source,
    torrentTitle: torrentRow.title,
    extension: `${langSuffix}${subExt}`,
  });
}

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

  const rawMethod = (await getSetting<string>(SETTINGS.IMPORT_METHOD)) ?? "local";
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

  const mediaNaming = {
    title: mediaRow.title,
    year: mediaRow.year,
    externalId: mediaRow.externalId,
    provider: mediaRow.provider,
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
      await mkdir(targetDir, { recursive: true });
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
      primarySeasonNumber, placeholders, alreadyImported, db, mediaRow, torrentRow,
    );

    await importLocalSubtitleFiles(
      subtitleFiles, savePath, targetDir, libraryPath, mediaRow, mediaNaming, torrentRow, primarySeasonNumber,
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
