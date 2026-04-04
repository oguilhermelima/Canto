import { link, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { Database } from "@canto/db/client";
import type { torrent as torrentSchema } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import type { DownloadClientPort } from "../ports/download-client";
import { isVideoFile, sanitizeName, buildMediaDir, buildFileName } from "../rules/naming";
import { EP_PATTERN, BARE_EP_PATTERN, isSubtitleFile, parseSubtitleLanguage } from "../rules/parsing";
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
} from "../../infrastructure/repositories";

export interface ImportHooks {
  onImported?: (mediaRow: { id: string; title: string; externalId: number; provider: string; type: string; libraryId: string | null }) => void;
}

type ImportMethod = "local" | "remote";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hardlinkOrCopy(source: string, target: string): Promise<"hardlink" | "copy" | "exists"> {
  try {
    await link(source, target);
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
  const torrents = await client.listTorrents();
  const torrent = torrents.find((t) => t.hash === hash);
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
    seasons?: Array<{ number: number; episodes?: Array<{ id: string; number: number }> }>;
  },
  mediaNaming: { title: string; year: number | null; externalId: number; provider: string; type: string },
  torrentRow: { quality: string; source: string },
  primarySeasonNumber: number | undefined,
): ParsedFile[] {
  const results: ParsedFile[] = [];

  for (const vf of videoFiles) {
    let seasonNumber = primarySeasonNumber;
    let episodeId: string | undefined;
    const ext = vf.name.substring(vf.name.lastIndexOf("."));

    let epNum: number | undefined;
    if (mediaRow.type === "show") {
      const match = EP_PATTERN.exec(vf.name);
      if (match) {
        seasonNumber = parseInt(match[1]!, 10);
        epNum = parseInt(match[2]!, 10);
      } else {
        const bareMatch = BARE_EP_PATTERN.exec(vf.name);
        if (bareMatch) {
          epNum = parseInt(bareMatch[1]!, 10);
        }
      }
      if (epNum !== undefined && seasonNumber !== undefined) {
        const matchedSeason = mediaRow.seasons?.find((s) => s.number === seasonNumber);
        const matchedEp = matchedSeason?.episodes?.find((e) => e.number === epNum);
        if (matchedEp) episodeId = matchedEp.id;
      }
    }

    let targetFilename: string;
    if (epNum !== undefined || mediaRow.type === "movie") {
      targetFilename = buildFileName(mediaNaming, {
        seasonNumber,
        episodeNumber: epNum,
        quality: torrentRow.quality,
        source: torrentRow.source,
        extension: ext,
      });
    } else {
      targetFilename = sanitizeName(vf.name.substring(vf.name.lastIndexOf("/") + 1));
    }

    results.push({
      file: vf,
      seasonNumber,
      episodeNumber: epNum,
      episodeId,
      targetFilename,
      extension: ext,
    });
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
  db: Database,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
): Promise<number> {
  let importedCount = 0;

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

      const method = await hardlinkOrCopy(sourcePath, targetPath);
      console.log(`[auto-import] ${method}: ${sourcePath} → ${targetPath}`);

      importedCount += await upsertMediaFile(db, pf, targetPath, placeholders, mediaRow, torrentRow);
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
  mediaRow: { type: string },
  mediaNaming: { title: string; year: number | null; externalId: number; provider: string; type: string },
  torrentRow: { quality: string; source: string },
  primarySeasonNumber: number | undefined,
): Promise<void> {
  for (const sf of subtitleFiles) {
    try {
      const targetSubName = buildSubtitleName(sf.name, mediaRow, mediaNaming, torrentRow, primarySeasonNumber);
      if (targetSubName) {
        const sourcePath = path.join(savePath, sf.name);
        const targetPath = path.join(targetDir, targetSubName);
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
  db: Database,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
): Promise<number> {
  // Move torrent files to target directory via client API
  try {
    await client.setLocation(hash, targetLocation);
    console.log(`[auto-import] Remote move → ${targetLocation}`);
  } catch (err) {
    console.error(`[auto-import] setLocation failed:`, err instanceof Error ? err.message : err);
    return 0;
  }

  // Wait for client to reorganize files
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Re-fetch files after move
  const movedFiles = await client.getTorrentFiles(hash);
  let importedCount = 0;

  for (const pf of parsedFiles) {
    try {
      // Find matching moved file
      const movedFile = movedFiles.find((mf) =>
        mf.name.includes(pf.file.name.substring(pf.file.name.lastIndexOf("/") + 1))
      ) ?? movedFiles.find((mf) => mf.size === pf.file.size);

      if (!movedFile) continue;

      // Rename via client API
      if (movedFile.name !== pf.targetFilename) {
        try {
          await client.renameFile(hash, movedFile.name, pf.targetFilename);
        } catch {
          console.warn(`[auto-import] renameFile failed for "${movedFile.name}", skipping rename`);
        }
      }

      // Compute host path (translate container → host if mapping exists)
      const finalPath = `${targetLocation}/${pf.targetFilename}`;

      importedCount += await upsertMediaFile(db, pf, finalPath, placeholders, mediaRow, torrentRow);
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
  torrentRow: { quality: string; source: string },
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
  torrentRow: { quality: string; source: string },
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
        extension: `${langSuffix}${subExt}`,
      });
    }
    return undefined;
  }

  return buildFileName(mediaNaming, {
    quality: torrentRow.quality,
    source: torrentRow.source,
    extension: `${langSuffix}${subExt}`,
  });
}

async function upsertMediaFile(
  db: Database,
  pf: ParsedFile,
  finalPath: string,
  placeholders: Array<{ id: string; episodeId: string | null }>,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
): Promise<number> {
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
  if (!torrentRow.hash || !torrentRow.mediaId) return;

  const mediaRow = await findMediaByIdWithSeasons(db, torrentRow.mediaId);
  if (!mediaRow) return;

  const placeholders = await findMediaFilesByTorrentId(db, torrentRow.id, "pending");

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

  if (videoFiles.length === 0) return;

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
      primarySeasonNumber, placeholders, db, mediaRow, torrentRow,
    );

    await importLocalSubtitleFiles(
      subtitleFiles, savePath, targetDir, mediaRow, mediaNaming, torrentRow, primarySeasonNumber,
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
      libRow ?? null, placeholders, db, mediaRow, torrentRow,
    );

    await importRemoteSubtitleFiles(
      subtitleFiles, client, torrentRow.hash, mediaRow, mediaNaming, torrentRow, primarySeasonNumber,
    );

    contentPath = targetLocation;
  }

  // ── Finalize ──

  await updateTorrent(db, torrentRow.id, {
    imported: true,
    importing: false,
    contentPath,
  });

  if (importedCount > 0) {
    console.log(`[auto-import] [${importMethod}] Imported ${importedCount} file(s) for "${mediaRow.title}"`);
    hooks?.onImported?.(mediaRow);
    await createNotification(db, {
      title: "Import complete",
      message: `Imported ${importedCount} file(s) for "${mediaRow.title}"`,
      type: "import_success",
      mediaId: mediaRow.id,
    });
  }
}
