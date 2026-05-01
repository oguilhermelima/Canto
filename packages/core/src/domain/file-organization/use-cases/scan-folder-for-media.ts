import { join, basename, extname } from "node:path";

import type { Database } from "@canto/db/client";

import type { FileSystemPort } from "@canto/core/domain/shared/ports/file-system.port";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import type { MediaAspectStateRepositoryPort } from "@canto/core/domain/media/ports/media-aspect-state-repository.port";
import type { MediaContentRatingRepositoryPort } from "@canto/core/domain/media/ports/media-content-rating-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import { persistMedia } from "@canto/core/domain/media/use-cases/persist";
import { runWithConcurrency } from "@canto/core/domain/shared/services/run-with-concurrency";
import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";
import type { UserPreferencesPort } from "@canto/core/domain/user/ports/user-preferences.port";
import { VIDEO_EXTENSIONS } from "@canto/core/domain/shared/rules/naming";
import { parseFolderMediaInfo } from "@canto/core/domain/torrents/rules/parsing";

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

export interface ScanFolderForMediaDeps {
  fs: FileSystemPort;
  logger: LoggerPort;
  dispatcher: JobDispatcherPort;
  tmdb: MediaProviderPort;
  media: MediaRepositoryPort;
  aspectState: MediaAspectStateRepositoryPort;
  lists: ListsRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  contentRating: MediaContentRatingRepositoryPort;
  extras: MediaExtrasRepositoryPort;
  userPrefs: UserPreferencesPort;
}

export async function scanFolderForMedia(
  db: Database,
  folderPath: string,
  libraryId: string,
  deps: ScanFolderForMediaDeps,
): Promise<{ imported: number; skipped: number; failed: number }> {
  if (scanningFolders.has(folderPath)) {
    deps.logger.info?.(`[folder-scan] Already scanning ${folderPath} — skipping`);
    return { imported: 0, skipped: 0, failed: 0 };
  }

  scanningFolders.add(folderPath);
  try {
    try {
      const s = await deps.fs.stat(folderPath);
      if (!s.isDirectory) {
        deps.logger.warn(`[folder-scan] Not a directory: ${folderPath}`);
        return { imported: 0, skipped: 0, failed: 0 };
      }
    } catch {
      deps.logger.warn(`[folder-scan] Cannot access: ${folderPath}`);
      return { imported: 0, skipped: 0, failed: 0 };
    }

    const videosByDir = await findVideosByDirectory(deps.fs, folderPath);
    if (videosByDir.size === 0) {
      deps.logger.info?.(`[folder-scan] No video files found in ${folderPath}`);
      return { imported: 0, skipped: 0, failed: 0 };
    }

    deps.logger.info?.(
      `[folder-scan] Found ${videosByDir.size} directories with video files in ${folderPath}`,
    );

    const supportedLangs = [...(await getActiveUserLanguages(deps))];

    type DirOutcome = "imported" | "skipped" | "failed";

    const processDirectory = async (dirPath: string): Promise<DirOutcome> => {
      const dirName = basename(dirPath);
      const parsed = parseFolderMediaInfo(dirName);

      if (!parsed) {
        deps.logger.warn(`[folder-scan] Could not parse directory name: ${dirName}`);
        return "failed";
      }

      try {
        let tmdbId = parsed.tmdbId;
        let resolvedType: "movie" | "show" = "movie";

        if (!tmdbId && parsed.imdbId && deps.tmdb.findByImdbId) {
          const results = await deps.tmdb.findByImdbId(parsed.imdbId);
          const first = results[0];
          if (first) {
            tmdbId = first.externalId;
            resolvedType = first.type === "show" ? "show" : "movie";
          }
        }

        if (!tmdbId) {
          const query = parsed.year
            ? `${parsed.title} ${parsed.year}`
            : parsed.title;
          const movieSearch = await deps.tmdb.search(query, "movie");
          const movieFirst = movieSearch.results[0];
          if (movieSearch.results.length === 1 && movieFirst) {
            tmdbId = movieFirst.externalId;
            resolvedType = "movie";
          } else {
            const showSearch = await deps.tmdb.search(query, "show");
            const showFirst = showSearch.results[0];
            if (showSearch.results.length === 1 && showFirst) {
              tmdbId = showFirst.externalId;
              resolvedType = "show";
            }
          }
        }

        if (!tmdbId) {
          deps.logger.warn(`[folder-scan] Could not resolve TMDB ID for: ${dirName}`);
          return "failed";
        }

        const existing = await deps.media.findByAnyReference(
          tmdbId,
          "tmdb",
          parsed.imdbId,
        );

        if (existing) {
          const updates: Record<string, unknown> = {};
          if (!existing.inLibrary) updates.inLibrary = true;
          if (!existing.downloaded) updates.downloaded = true;
          if (!existing.libraryId) updates.libraryId = libraryId;
          if (!existing.libraryPath) updates.libraryPath = dirPath;
          if (!existing.addedAt) updates.addedAt = new Date();

          if (Object.keys(updates).length > 0) {
            await deps.media.updateMedia(existing.id, updates);
          }

          const wasAlreadyInLibrary = existing.inLibrary;
          if (!wasAlreadyInLibrary) {
            try {
              const serverLib = await deps.lists.ensureServerLibrary();
              await deps.lists.addItem({
                listId: serverLib.id,
                mediaId: existing.id,
              });
            } catch {
              // already in list
            }
          }

          const metadataSucceededAt = await deps.aspectState.findSucceededAt(
            existing.id,
            "metadata",
          );
          if (!metadataSucceededAt) {
            deps.dispatcher
              .enrichMedia(existing.id)
              .catch(deps.logger.logAndSwallow("folder-scan dispatchEnsureMedia"));
          }

          return wasAlreadyInLibrary ? "skipped" : "imported";
        }

        const normalized = await deps.tmdb.getMetadata(tmdbId, resolvedType, {
          supportedLanguages: supportedLangs,
        });
        const inserted = await persistMedia(db, normalized, deps);
        await deps.media.updateMedia(inserted.id, {
          inLibrary: true,
          downloaded: true,
          libraryId,
          libraryPath: dirPath,
          addedAt: new Date(),
        });
        deps.dispatcher
          .enrichMedia(inserted.id)
          .catch(deps.logger.logAndSwallow("folder-scan dispatchEnsureMedia"));

        try {
          const serverLib = await deps.lists.ensureServerLibrary();
          await deps.lists.addItem({
            listId: serverLib.id,
            mediaId: inserted.id,
          });
        } catch {
          // already in list
        }

        deps.logger.info?.(
          `[folder-scan] Imported: ${parsed.title} (${parsed.year ?? "?"})`,
        );
        return "imported";
      } catch (err) {
        deps.logger.error(`[folder-scan] Error processing ${dirName}`, {
          error: err instanceof Error ? err.message : "Unknown error",
        });
        return "failed";
      }
    };

    const dirPaths = Array.from(videosByDir.keys());
    const outcomes = await runWithConcurrency(
      dirPaths,
      SCAN_CONCURRENCY,
      processDirectory,
    );

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    for (const o of outcomes) {
      if (o === "imported") imported++;
      else if (o === "skipped") skipped++;
      else failed++;
    }

    deps.logger.info?.(
      `[folder-scan] Done: ${imported} imported, ${skipped} skipped, ${failed} failed`,
    );
    return { imported, skipped, failed };
  } finally {
    scanningFolders.delete(folderPath);
  }
}
