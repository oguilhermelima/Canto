import { readdir, stat } from "node:fs/promises";
import { join, basename, extname } from "node:path";

import type { Database } from "@canto/db/client";
import { persistMedia, getSupportedLanguageCodes } from "@canto/db/persist-media";

import { parseFolderMediaInfo } from "../rules/parsing";
import { VIDEO_EXTENSIONS } from "../rules/naming";
import { getTmdbProvider } from "../../lib/tmdb-client";
import {
  findMediaByAnyReference,
  updateMedia,
} from "../../infrastructure/repositories/media-repository";
import {
  ensureServerLibrary,
  addListItem,
} from "../../infrastructure/repositories/list-repository";
import { dispatchMediaPipeline } from "../../infrastructure/queue/bullmq-dispatcher";

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
  root: string,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Skip inaccessible directories
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isVideoExt(entry.name)) {
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

const ITEM_DELAY_MS = 250;
const scanningFolders = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scanFolderForMedia(
  db: Database,
  folderPath: string,
  libraryId: string,
): Promise<{ imported: number; skipped: number; failed: number }> {
  if (scanningFolders.has(folderPath)) {
    console.log(`[folder-scan] Already scanning ${folderPath} — skipping`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  scanningFolders.add(folderPath);
  try {
  // Verify folder exists
  try {
    const s = await stat(folderPath);
    if (!s.isDirectory()) {
      console.log(`[folder-scan] Not a directory: ${folderPath}`);
      return { imported: 0, skipped: 0, failed: 0 };
    }
  } catch {
    console.log(`[folder-scan] Cannot access: ${folderPath}`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  const videosByDir = await findVideosByDirectory(folderPath);
  if (videosByDir.size === 0) {
    console.log(`[folder-scan] No video files found in ${folderPath}`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  console.log(`[folder-scan] Found ${videosByDir.size} directories with video files in ${folderPath}`);

  const tmdb = await getTmdbProvider();
  const supportedLangs = [...await getSupportedLanguageCodes(db)];

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const [dirPath] of videosByDir) {
    const dirName = basename(dirPath);
    const parsed = parseFolderMediaInfo(dirName);

    if (!parsed) {
      console.log(`[folder-scan] Could not parse directory name: ${dirName}`);
      failed++;
      continue;
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
        failed++;
        await sleep(ITEM_DELAY_MS);
        continue;
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

        if (existing.inLibrary) {
          skipped++;
        } else {
          // Was in DB but not in library — now it is
          try {
            const serverLib = await ensureServerLibrary(db);
            await addListItem(db, { listId: serverLib.id, mediaId: existing.id });
          } catch { /* already in list */ }
          imported++;
        }

        if (!existing.metadataUpdatedAt) {
          void dispatchMediaPipeline({ mediaId: existing.id }).catch(() => {});
        }
      } else {
        // 3. New media — fetch from TMDB, persist, mark as downloaded
        const normalized = await tmdb.getMetadata(tmdbId, resolvedType, { supportedLanguages: supportedLangs });
        const inserted = await persistMedia(db, normalized);
        await updateMedia(db, inserted.id, {
          inLibrary: true,
          downloaded: true,
          libraryId,
          libraryPath: dirPath,
          addedAt: new Date(),
        });
        void dispatchMediaPipeline({ mediaId: inserted.id }).catch(() => {});

        try {
          const serverLib = await ensureServerLibrary(db);
          await addListItem(db, { listId: serverLib.id, mediaId: inserted.id });
        } catch { /* already in list */ }

        imported++;
        console.log(`[folder-scan] Imported: ${parsed.title} (${parsed.year ?? "?"})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[folder-scan] Error processing ${dirName}:`, msg);
      failed++;
    }

    await sleep(ITEM_DELAY_MS);
  }

  console.log(`[folder-scan] Done: ${imported} imported, ${skipped} skipped, ${failed} failed`);
  return { imported, skipped, failed };
  } finally {
    scanningFolders.delete(folderPath);
  }
}
