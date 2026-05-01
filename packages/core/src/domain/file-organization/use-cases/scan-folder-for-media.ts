import { join, basename, extname } from "node:path";

import type { Database } from "@canto/db/client";
import { persistMedia } from "@canto/core/domain/media/use-cases/persist";
import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";

import type { FileSystemPort } from "@canto/core/domain/shared/ports/file-system.port";
import { parseFolderMediaInfo } from "@canto/core/domain/torrents/rules/parsing";
import { VIDEO_EXTENSIONS } from "@canto/core/domain/shared/rules/naming";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import {
  findMediaByAnyReference,
  updateMedia,
} from "@canto/core/infra/media/media-repository";
import { findAspectSucceededAt } from "@canto/core/infra/media/media-aspect-state-repository";
import {
  addListItem,
  ensureServerLibrary,
} from "@canto/core/infra/lists/list-repository";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import { dispatchEnsureMedia } from "@canto/core/platform/queue/bullmq-dispatcher";
import { runWithConcurrency } from "@canto/core/platform/concurrency/run-with-concurrency";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isVideoExt(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Recursively find all video files under `root` and return them grouped by
 * their immediate parent directory (each directory = one media item).
 */
async function findVideosByDirectory(
  fs: FileSystemPort,
  root: string,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir);
    } catch {
      return; // Skip inaccessible directories
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory) {
        await walk(fullPath);
      } else if (entry.isFile && isVideoExt(entry.name)) {
        const parent = dir;
        const existing = result.get(parent);
        if (existing) {
          existing.push(fullPath);
        } else {
          result.set(parent, [fullPath]);
        }
      }
    }
  }

  await walk(root);
  return result;
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */

/** TMDB allows ~50 RPS — 4 concurrent directory resolves stays well under. */
const SCAN_CONCURRENCY = 4;
const scanningFolders = new Set<string>();

export async function scanFolderForMedia(
  db: Database,
  folderPath: string,
  libraryId: string,
  deps: { fs: FileSystemPort; logger: LoggerPort },
): Promise<{ imported: number; skipped: number; failed: number }> {
  if (scanningFolders.has(folderPath)) {
    console.log(`[folder-scan] Already scanning ${folderPath} — skipping`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  scanningFolders.add(folderPath);
  try {
  // Verify folder exists
  try {
    const s = await deps.fs.stat(folderPath);
    if (!s.isDirectory) {
      console.log(`[folder-scan] Not a directory: ${folderPath}`);
      return { imported: 0, skipped: 0, failed: 0 };
    }
  } catch {
    console.log(`[folder-scan] Cannot access: ${folderPath}`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  const videosByDir = await findVideosByDirectory(deps.fs, folderPath);
  if (videosByDir.size === 0) {
    console.log(`[folder-scan] No video files found in ${folderPath}`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  console.log(`[folder-scan] Found ${videosByDir.size} directories with video files in ${folderPath}`);

  const tmdb = await getTmdbProvider();
  const supportedLangs = [...await getActiveUserLanguages(db)];

  type DirOutcome = "imported" | "skipped" | "failed";

  const processDirectory = async (dirPath: string): Promise<DirOutcome> => {
    const dirName = basename(dirPath);
    const parsed = parseFolderMediaInfo(dirName);

    if (!parsed) {
      console.log(`[folder-scan] Could not parse directory name: ${dirName}`);
      return "failed";
    }

    try {
      // 1. Resolve TMDB ID
      let tmdbId = parsed.tmdbId;
      let resolvedType: "movie" | "show" = "movie";

      if (!tmdbId && parsed.imdbId) {
        const results = await tmdb.findByImdbId(parsed.imdbId);
        if (results.length > 0) {
          tmdbId = results[0]!.externalId;
          resolvedType = results[0]!.type as "movie" | "show";
        }
      }

      if (!tmdbId) {
        const query = parsed.year ? `${parsed.title} ${parsed.year}` : parsed.title;
        // Search both movies and shows — take the first confident match
        const movieSearch = await tmdb.search(query, "movie");
        if (movieSearch.results.length === 1) {
          tmdbId = movieSearch.results[0]!.externalId;
          resolvedType = "movie";
        } else {
          const showSearch = await tmdb.search(query, "show");
          if (showSearch.results.length === 1) {
            tmdbId = showSearch.results[0]!.externalId;
            resolvedType = "show";
          }
        }
      }

      if (!tmdbId) {
        console.log(`[folder-scan] Could not resolve TMDB ID for: ${dirName}`);
        return "failed";
      }

      // 2. Check if already in DB
      const existing = await findMediaByAnyReference(db, tmdbId, "tmdb", parsed.imdbId);

      if (existing) {
        // Update if not yet marked as in library / downloaded
        const updates: Record<string, unknown> = {};
        if (!existing.inLibrary) updates.inLibrary = true;
        if (!existing.downloaded) updates.downloaded = true;
        if (!existing.libraryId) updates.libraryId = libraryId;
        if (!existing.libraryPath) updates.libraryPath = dirPath;
        if (!existing.addedAt) updates.addedAt = new Date();

        if (Object.keys(updates).length > 0) {
          await updateMedia(db, existing.id, updates);
        }

        const wasAlreadyInLibrary = existing.inLibrary;
        if (!wasAlreadyInLibrary) {
          try {
            const serverLib = await ensureServerLibrary(db);
            await addListItem(db, { listId: serverLib.id, mediaId: existing.id });
          } catch { /* already in list */ }
        }

        const metadataSucceededAt = await findAspectSucceededAt(
          db,
          existing.id,
          "metadata",
        );
        if (!metadataSucceededAt) {
          dispatchEnsureMedia(existing.id).catch(
            deps.logger.logAndSwallow("folder-scan dispatchEnsureMedia"),
          );
        }

        return wasAlreadyInLibrary ? "skipped" : "imported";
      }

      // 3. New media — fetch from TMDB, persist, mark as downloaded
      const normalized = await tmdb.getMetadata(tmdbId, resolvedType, {
        supportedLanguages: supportedLangs,
      });
      const inserted = await persistMedia(db, normalized);
      await updateMedia(db, inserted.id, {
        inLibrary: true,
        downloaded: true,
        libraryId,
        libraryPath: dirPath,
        addedAt: new Date(),
      });
      dispatchEnsureMedia(inserted.id).catch(
        deps.logger.logAndSwallow("folder-scan dispatchEnsureMedia"),
      );

      try {
        const serverLib = await ensureServerLibrary(db);
        await addListItem(db, { listId: serverLib.id, mediaId: inserted.id });
      } catch { /* already in list */ }

      console.log(`[folder-scan] Imported: ${parsed.title} (${parsed.year ?? "?"})`);
      return "imported";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[folder-scan] Error processing ${dirName}:`, msg);
      return "failed";
    }
  };

  // Run directory scans in parallel — TMDB rate limits aren't the bottleneck
  // here, the previous 250ms delay was wasted wall-clock per item.
  const dirPaths = Array.from(videosByDir.keys());
  const outcomes = await runWithConcurrency(dirPaths, SCAN_CONCURRENCY, processDirectory);

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const o of outcomes) {
    if (o === "imported") imported++;
    else if (o === "skipped") skipped++;
    else failed++;
  }

  console.log(`[folder-scan] Done: ${imported} imported, ${skipped} skipped, ${failed} failed`);
  return { imported, skipped, failed };
  } finally {
    scanningFolders.delete(folderPath);
  }
}
