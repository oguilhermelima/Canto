import path from "node:path";
import { rename, mkdir, rmdir } from "node:fs/promises";

import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { getEffectiveProvider } from "../rules/effective-provider";
import {
  buildMediaDir,
  buildFileName,
  type MediaNamingInfo,
} from "../rules/naming";
import type { DownloadClientPort } from "../ports/download-client";
import {
  findMediaByIdWithSeasons,
  findMediaFilesByMediaId,
  findTorrentsByMediaId,
  updateMediaFile,
  updateTorrent,
} from "../../infrastructure/repositories";

// ── Public types ───────────────────────────────────────────────────────────

export interface FileRenamePreview {
  oldPath: string;
  newPath: string;
  episodeLabel: string;
  status: "rename" | "skip" | "unmapped";
}

export interface ReorganizeResult {
  renamed: number;
  skipped: number;
  failed: Array<{ oldPath: string; error: string }>;
}

// ── Internal types ─────────────────────────────────────────────────────────

interface RenameEntry extends FileRenamePreview {
  mediaFileId: string;
  torrentId: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PROVIDER_TAG_REGEX = /\[(?:tmdbid|tvdbid)-\d+\]/;

/**
 * Extract the library base path from a stored filePath.
 * E.g. `/data/media/tv/Show (2020) [tmdbid-123]/Season 01/ep.mkv`
 *    → `/data/media/tv`
 */
function extractLibraryBasePath(filePath: string): string {
  const parts = filePath.split(path.sep);
  const idx = parts.findIndex((p) => PROVIDER_TAG_REGEX.test(p));
  if (idx <= 0) return path.dirname(path.dirname(filePath));
  return parts.slice(0, idx).join(path.sep);
}

function buildEpisodeLabel(
  seasonNumber: number,
  episodeNumber: number,
  title: string | null,
): string {
  const sn = String(seasonNumber).padStart(2, "0");
  const en = String(episodeNumber).padStart(2, "0");
  return title ? `S${sn}E${en} - ${title}` : `S${sn}E${en}`;
}

// ── Shared rename list builder ─────────────────────────────────────────────

async function buildRenameList(
  db: Database,
  mediaId: string,
): Promise<RenameEntry[]> {
  const mediaRow = await findMediaByIdWithSeasons(db, mediaId);
  if (!mediaRow) throw new Error(`Media ${mediaId} not found`);

  const mediaFiles = await findMediaFilesByMediaId(db, mediaId);
  if (mediaFiles.length === 0) return [];

  const effectiveProvider = await getEffectiveProvider(mediaRow);
  const namingExternalId =
    effectiveProvider === "tvdb" && mediaRow.tvdbId
      ? mediaRow.tvdbId
      : mediaRow.externalId;

  const mediaNaming: MediaNamingInfo = {
    title: mediaRow.title,
    year: mediaRow.year,
    externalId: namingExternalId,
    provider: effectiveProvider,
    type: mediaRow.type,
  };

  const entries: RenameEntry[] = [];

  for (const mf of mediaFiles) {
    if (!mf.filePath) continue;

    if (!mf.episode) {
      if (mediaRow.type === "movie") {
        const ext = mf.filePath.substring(mf.filePath.lastIndexOf("."));
        const basePath = extractLibraryBasePath(mf.filePath);
        const newDir = buildMediaDir(mediaNaming);
        const newFilename = buildFileName(mediaNaming, {
          quality: mf.quality ?? undefined,
          source: mf.source ?? undefined,
          torrentTitle: mf.torrent?.title ?? undefined,
          extension: ext,
        });
        const newPath = path.join(basePath, newDir, newFilename);
        entries.push({
          mediaFileId: mf.id,
          torrentId: mf.torrentId,
          oldPath: mf.filePath,
          newPath,
          episodeLabel: mediaNaming.title,
          status: mf.filePath === newPath ? "skip" : "rename",
        });
      } else {
        entries.push({
          mediaFileId: mf.id,
          torrentId: mf.torrentId,
          oldPath: mf.filePath,
          newPath: mf.filePath,
          episodeLabel: "Unmapped",
          status: "unmapped",
        });
      }
      continue;
    }

    const seasonNumber = mf.episode.season.number;
    const episodeNumber = mf.episode.number;
    const episodeTitle = mf.episode.title;
    const ext = mf.filePath.substring(mf.filePath.lastIndexOf("."));

    const basePath = extractLibraryBasePath(mf.filePath);
    const newDir = buildMediaDir(mediaNaming, seasonNumber);
    const newFilename = buildFileName(mediaNaming, {
      seasonNumber,
      episodeNumber,
      episodeTitle: episodeTitle ?? undefined,
      quality: mf.quality ?? undefined,
      source: mf.source ?? undefined,
      torrentTitle: mf.torrent?.title ?? undefined,
      extension: ext,
    });
    const newPath = path.join(basePath, newDir, newFilename);

    entries.push({
      mediaFileId: mf.id,
      torrentId: mf.torrentId,
      oldPath: mf.filePath,
      newPath,
      episodeLabel: buildEpisodeLabel(seasonNumber, episodeNumber, episodeTitle),
      status: mf.filePath === newPath ? "skip" : "rename",
    });
  }

  return entries;
}

// ── Preview ────────────────────────────────────────────────────────────────

export async function previewReorganizeMediaFiles(
  db: Database,
  mediaId: string,
): Promise<FileRenamePreview[]> {
  return buildRenameList(db, mediaId);
}

// ── Execute ────────────────────────────────────────────────────────────────

export async function executeReorganizeMediaFiles(
  db: Database,
  mediaId: string,
  client?: DownloadClientPort,
): Promise<ReorganizeResult> {
  const entries = await buildRenameList(db, mediaId);
  const toRename = entries.filter((e) => e.status === "rename");
  const skipped = entries.filter((e) => e.status !== "rename").length;

  if (toRename.length === 0) {
    return { renamed: 0, skipped, failed: [] };
  }

  // Security check: no torrent should be mid-import
  const torrents = await findTorrentsByMediaId(db, mediaId);
  if (torrents.some((t) => t.importing)) {
    throw new Error("Cannot reorganize files while a torrent is being imported");
  }

  const importMethod =
    (await getSetting("download.importMethod")) ?? "local";
  const result: ReorganizeResult = { renamed: 0, skipped, failed: [] };

  if (importMethod === "local") {
    await executeLocalRenames(toRename, result, db);
  } else {
    if (!client) {
      throw new Error("Download client required for remote reorganize");
    }
    await executeRemoteRenames(toRename, torrents, client, result, db);
  }

  return result;
}

// ── Local rename strategy ──────────────────────────────────────────────────

async function executeLocalRenames(
  toRename: RenameEntry[],
  result: ReorganizeResult,
  db: Database,
): Promise<void> {
  // Detect whether the parent media dir needs renaming (e.g. [tmdbid-X] → [tvdbid-Y])
  const oldParentDirs = new Set<string>();
  const newParentDirs = new Set<string>();

  for (const r of toRename) {
    const oldParts = r.oldPath.split(path.sep);
    const newParts = r.newPath.split(path.sep);
    const oldIdx = oldParts.findIndex((p) => PROVIDER_TAG_REGEX.test(p));
    const newIdx = newParts.findIndex((p) => PROVIDER_TAG_REGEX.test(p));
    if (oldIdx >= 0)
      oldParentDirs.add(oldParts.slice(0, oldIdx + 1).join(path.sep));
    if (newIdx >= 0)
      newParentDirs.add(newParts.slice(0, newIdx + 1).join(path.sep));
  }

  // Rename parent dir first if it changed
  const parentRenamedFrom = new Map<string, string>();

  if (oldParentDirs.size === 1 && newParentDirs.size === 1) {
    const oldParent = [...oldParentDirs][0]!;
    const newParent = [...newParentDirs][0]!;
    if (oldParent !== newParent) {
      try {
        await rename(oldParent, newParent);
        parentRenamedFrom.set(oldParent, newParent);
      } catch (err) {
        for (const r of toRename) {
          result.failed.push({
            oldPath: r.oldPath,
            error: `Parent dir rename failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        return;
      }
    }
  }

  // Create any new season subdirectories
  const targetDirs = new Set(toRename.map((r) => path.dirname(r.newPath)));
  for (const dir of targetDirs) {
    await mkdir(dir, { recursive: true });
  }

  // Track old season dirs for cleanup
  const oldSeasonDirs = new Set(toRename.map((r) => path.dirname(r.oldPath)));

  // Rename individual files
  for (const r of toRename) {
    try {
      // Adjust oldPath if the parent dir was already renamed
      let effectiveOldPath = r.oldPath;
      for (const [oldP, newP] of parentRenamedFrom) {
        if (r.oldPath.startsWith(oldP + path.sep)) {
          effectiveOldPath = newP + r.oldPath.slice(oldP.length);
          break;
        }
      }

      await rename(effectiveOldPath, r.newPath);
      await updateMediaFile(db, r.mediaFileId, { filePath: r.newPath });
      result.renamed++;
    } catch (err) {
      result.failed.push({
        oldPath: r.oldPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Try to remove empty old season directories
  for (const dir of oldSeasonDirs) {
    let effectiveDir = dir;
    for (const [oldP, newP] of parentRenamedFrom) {
      if (dir.startsWith(oldP + path.sep)) {
        effectiveDir = newP + dir.slice(oldP.length);
        break;
      }
    }
    try {
      await rmdir(effectiveDir);
    } catch {
      // ENOTEMPTY or ENOENT — ignore
    }
  }
}

// ── Remote rename strategy ─────────────────────────────────────────────────

async function executeRemoteRenames(
  toRename: RenameEntry[],
  torrents: Awaited<ReturnType<typeof findTorrentsByMediaId>>,
  client: DownloadClientPort,
  result: ReorganizeResult,
  db: Database,
): Promise<void> {
  const torrentMap = new Map(
    torrents.filter((t) => t.hash).map((t) => [t.id, t]),
  );

  // Group renames by torrent
  const byTorrent = new Map<string, RenameEntry[]>();
  for (const r of toRename) {
    if (!r.torrentId) continue;
    const list = byTorrent.get(r.torrentId) ?? [];
    list.push(r);
    byTorrent.set(r.torrentId, list);
  }

  for (const [torrentId, entries] of byTorrent) {
    const torrentRow = torrentMap.get(torrentId);
    if (!torrentRow?.hash || !torrentRow.contentPath) continue;

    for (const r of entries) {
      try {
        const oldRelative = path.relative(torrentRow.contentPath, r.oldPath);
        const newRelative = path.basename(r.newPath);

        if (oldRelative !== newRelative) {
          await client.renameFile(torrentRow.hash, oldRelative, newRelative);
        }

        await updateMediaFile(db, r.mediaFileId, { filePath: r.newPath });
        result.renamed++;
      } catch (err) {
        result.failed.push({
          oldPath: r.oldPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Update torrent contentPath if parent dir changed
    const firstEntry = entries[0];
    if (firstEntry) {
      const newContentDir = path.dirname(firstEntry.newPath);
      if (newContentDir !== torrentRow.contentPath) {
        await updateTorrent(db, torrentRow.id, { contentPath: newContentDir });
      }
    }
  }
}
