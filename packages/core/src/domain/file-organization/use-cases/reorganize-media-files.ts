import path from "node:path";

import { getSetting } from "@canto/db/settings";

import {
  ReorganizeRequiresClientError,
  ReorganizeWhileImportingError,
} from "@canto/core/domain/file-organization/errors";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import { MediaNotFoundError } from "@canto/core/domain/shared/errors";
import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { FileSystemPort } from "@canto/core/domain/shared/ports/file-system.port";
import { getEffectiveProvider } from "@canto/core/domain/shared/rules/effective-provider";
import {
  buildFileName,
  buildMediaDir,
} from "@canto/core/domain/shared/rules/naming";
import type { MediaNamingInfo } from "@canto/core/domain/shared/rules/naming";
import type { Download } from "@canto/core/domain/torrents/types/download";
import type { MediaFileWithDetails } from "@canto/core/domain/torrents/types/media-file";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";

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

export interface ReorganizeMediaFilesDeps {
  media: MediaRepositoryPort;
  torrents: TorrentsRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
}

export interface ExecuteReorganizeMediaFilesDeps
  extends ReorganizeMediaFilesDeps {
  fs: FileSystemPort;
  client?: DownloadClientPort;
}

// ── Internal types ─────────────────────────────────────────────────────────

interface RenameEntry extends FileRenamePreview {
  mediaFileId: string;
  downloadId: string | null;
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

function buildEntryForMovie(
  mf: MediaFileWithDetails,
  mediaNaming: MediaNamingInfo,
): RenameEntry {
  const ext = mf.filePath.substring(mf.filePath.lastIndexOf("."));
  const basePath = extractLibraryBasePath(mf.filePath);
  const newDir = buildMediaDir(mediaNaming);
  const newFilename = buildFileName(mediaNaming, {
    quality: mf.quality ?? undefined,
    source: mf.source ?? undefined,
    torrentTitle: mf.download?.title ?? undefined,
    extension: ext,
  });
  const newPath = path.join(basePath, newDir, newFilename);
  return {
    mediaFileId: mf.id,
    downloadId: mf.downloadId,
    oldPath: mf.filePath,
    newPath,
    episodeLabel: mediaNaming.title,
    status: mf.filePath === newPath ? "skip" : "rename",
  };
}

function buildEntryForEpisode(
  mf: MediaFileWithDetails,
  mediaNaming: MediaNamingInfo,
): RenameEntry {
  const episode = mf.episode;
  if (!episode) {
    return {
      mediaFileId: mf.id,
      downloadId: mf.downloadId,
      oldPath: mf.filePath,
      newPath: mf.filePath,
      episodeLabel: "Unmapped",
      status: "unmapped",
    };
  }

  const seasonNumber = episode.season.number;
  const episodeNumber = episode.number;
  const episodeTitle = episode.title;
  const ext = mf.filePath.substring(mf.filePath.lastIndexOf("."));

  const basePath = extractLibraryBasePath(mf.filePath);
  const newDir = buildMediaDir(mediaNaming, seasonNumber);
  const newFilename = buildFileName(mediaNaming, {
    seasonNumber,
    episodeNumber,
    episodeTitle: episodeTitle ?? undefined,
    quality: mf.quality ?? undefined,
    source: mf.source ?? undefined,
    torrentTitle: mf.download?.title ?? undefined,
    extension: ext,
  });
  const newPath = path.join(basePath, newDir, newFilename);

  return {
    mediaFileId: mf.id,
    downloadId: mf.downloadId,
    oldPath: mf.filePath,
    newPath,
    episodeLabel: buildEpisodeLabel(seasonNumber, episodeNumber, episodeTitle),
    status: mf.filePath === newPath ? "skip" : "rename",
  };
}

// ── Shared rename list builder ─────────────────────────────────────────────

async function buildRenameList(
  deps: ReorganizeMediaFilesDeps,
  mediaId: string,
): Promise<RenameEntry[]> {
  const mediaRow = await deps.media.findByIdWithSeasons(mediaId);
  if (!mediaRow) throw new MediaNotFoundError(mediaId);

  const mediaFiles = await deps.torrents.findMediaFilesByMediaId(mediaId);
  if (mediaFiles.length === 0) return [];

  const effectiveProvider = await getEffectiveProvider(mediaRow);
  const namingExternalId =
    effectiveProvider === "tvdb" && mediaRow.tvdbId
      ? mediaRow.tvdbId
      : mediaRow.externalId;

  // Filenames mirror the canonical en-US title.
  const enLoc = await deps.localization.findLocalizedById(mediaRow.id, "en-US");
  const mediaNaming: MediaNamingInfo = {
    title: enLoc?.title ?? "",
    year: mediaRow.year,
    externalId: namingExternalId,
    provider: effectiveProvider,
    type: mediaRow.type,
  };

  const entries: RenameEntry[] = [];

  for (const mf of mediaFiles) {
    if (!mf.filePath) continue;

    if (!mf.episode && mediaRow.type === "movie") {
      entries.push(buildEntryForMovie(mf, mediaNaming));
      continue;
    }

    entries.push(buildEntryForEpisode(mf, mediaNaming));
  }

  return entries;
}

// ── Preview ────────────────────────────────────────────────────────────────

export async function previewReorganizeMediaFiles(
  deps: ReorganizeMediaFilesDeps,
  mediaId: string,
): Promise<FileRenamePreview[]> {
  return buildRenameList(deps, mediaId);
}

// ── Execute ────────────────────────────────────────────────────────────────

export async function executeReorganizeMediaFiles(
  deps: ExecuteReorganizeMediaFilesDeps,
  mediaId: string,
): Promise<ReorganizeResult> {
  const entries = await buildRenameList(deps, mediaId);
  const toRename = entries.filter((e) => e.status === "rename");
  const skipped = entries.filter((e) => e.status !== "rename").length;

  if (toRename.length === 0) {
    return { renamed: 0, skipped, failed: [] };
  }

  const downloads = await deps.torrents.findDownloadsByMediaId(mediaId);
  if (downloads.some((t) => t.importing)) {
    throw new ReorganizeWhileImportingError();
  }

  const importMethod =
    (await getSetting("download.importMethod")) ?? "local";
  const result: ReorganizeResult = { renamed: 0, skipped, failed: [] };

  if (importMethod === "local") {
    await executeLocalRenames(toRename, result, deps);
    return result;
  }

  if (!deps.client) {
    throw new ReorganizeRequiresClientError();
  }
  await executeRemoteRenames(toRename, downloads, deps.client, result, deps);
  return result;
}

// ── Local rename strategy ──────────────────────────────────────────────────

async function executeLocalRenames(
  toRename: RenameEntry[],
  result: ReorganizeResult,
  deps: ExecuteReorganizeMediaFilesDeps,
): Promise<void> {
  const fs = deps.fs;
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
    const [oldParent] = [...oldParentDirs];
    const [newParent] = [...newParentDirs];
    if (oldParent && newParent && oldParent !== newParent) {
      try {
        await fs.rename(oldParent, newParent);
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
    await fs.mkdir(dir, { recursive: true });
  }

  // Track old season dirs for cleanup
  const oldSeasonDirs = new Set(toRename.map((r) => path.dirname(r.oldPath)));

  // Rename individual files
  for (const r of toRename) {
    try {
      let effectiveOldPath = r.oldPath;
      for (const [oldP, newP] of parentRenamedFrom) {
        if (r.oldPath.startsWith(oldP + path.sep)) {
          effectiveOldPath = newP + r.oldPath.slice(oldP.length);
          break;
        }
      }

      await fs.rename(effectiveOldPath, r.newPath);
      await deps.torrents.updateMediaFile(r.mediaFileId, { filePath: r.newPath });
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
      await fs.rmdir(effectiveDir);
    } catch {
      // ENOTEMPTY or ENOENT — ignore
    }
  }
}

// ── Remote rename strategy ─────────────────────────────────────────────────

async function executeRemoteRenames(
  toRename: RenameEntry[],
  downloads: Download[],
  client: DownloadClientPort,
  result: ReorganizeResult,
  deps: ExecuteReorganizeMediaFilesDeps,
): Promise<void> {
  const downloadMap = new Map<string, Download>(
    downloads.filter((d) => d.hash).map((d) => [d.id, d]),
  );

  const byDownload = new Map<string, RenameEntry[]>();
  for (const r of toRename) {
    if (!r.downloadId) continue;
    const list = byDownload.get(r.downloadId) ?? [];
    list.push(r);
    byDownload.set(r.downloadId, list);
  }

  for (const [downloadId, entries] of byDownload) {
    const downloadRow = downloadMap.get(downloadId);
    if (!downloadRow?.hash || !downloadRow.contentPath) continue;

    for (const r of entries) {
      try {
        const oldRelative = path.relative(downloadRow.contentPath, r.oldPath);
        const newRelative = path.basename(r.newPath);

        if (oldRelative !== newRelative) {
          await client.renameFile(downloadRow.hash, oldRelative, newRelative);
        }

        await deps.torrents.updateMediaFile(r.mediaFileId, { filePath: r.newPath });
        result.renamed++;
      } catch (err) {
        result.failed.push({
          oldPath: r.oldPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const firstEntry = entries[0];
    if (firstEntry) {
      const newContentDir = path.dirname(firstEntry.newPath);
      if (newContentDir !== downloadRow.contentPath) {
        await deps.torrents.updateDownload(downloadRow.id, {
          contentPath: newContentDir,
        });
      }
    }
  }
}
