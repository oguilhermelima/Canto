import { rename, mkdir, stat } from "node:fs/promises";
import path from "node:path";

import type { Database } from "@canto/db/client";
import {
  findAllLibraries,
  updateLibrary,
} from "../../infrastructure/repositories/library-repository";
import {
  findAllMediaFiles,
  updateMediaFile,
} from "../../infrastructure/repositories/media-file-repository";

export interface MigrationResult {
  migrated: number;
  skipped: number;
  errors: string[];
  directoriesCreated: string[];
}

/**
 * Migrate existing media files from the legacy path layout to the new
 * /data-based structure.
 *
 * For each imported media_file:
 * 1. Determine which library it belongs to (by matching its current filePath
 *    against library mediaPath / containerMediaPath / libraryPath prefixes).
 * 2. Compute the new path under the target libraryPath.
 * 3. Move (rename) the file to the new location.
 * 4. Update the DB record.
 */
export async function migrateToNewStructure(
  db: Database,
  rootPath: string,
): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, skipped: 0, errors: [], directoriesCreated: [] };

  const libraries = await findAllLibraries(db);

  // Ensure target directories exist
  for (const lib of libraries) {
    const category = lib.qbitCategory ?? lib.type;
    const dlDir = `${rootPath}/torrents/${category}`;
    const libDir = `${rootPath}/media/${lib.name.toLowerCase()}`;

    for (const dir of [dlDir, libDir]) {
      try {
        await mkdir(dir, { recursive: true });
        result.directoriesCreated.push(dir);
      } catch {
        // Already exists
      }
    }

    // Update library paths
    await updateLibrary(db, lib.id, {
      downloadPath: dlDir,
      libraryPath: libDir,
    });
  }

  // Migrate media files
  const mediaFiles = await findAllMediaFiles(db, "imported");

  for (const mf of mediaFiles) {
    if (!mf.filePath) {
      result.skipped++;
      continue;
    }

    // Find which library this file belongs to
    const matchedLib = libraries.find((lib) => {
      if (lib.libraryPath && mf.filePath.startsWith(lib.libraryPath)) return true;
      if (lib.mediaPath && mf.filePath.startsWith(lib.mediaPath)) return true;
      if (lib.containerMediaPath && mf.filePath.startsWith(lib.containerMediaPath)) return true;
      return false;
    });

    if (!matchedLib) {
      result.skipped++;
      continue;
    }

    const newLibraryPath = `${rootPath}/media/${matchedLib.name.toLowerCase()}`;

    // If already under the new path, skip
    if (mf.filePath.startsWith(newLibraryPath)) {
      result.skipped++;
      continue;
    }

    // Compute relative path from old library root
    const oldRoot = matchedLib.mediaPath ?? matchedLib.containerMediaPath ?? matchedLib.libraryPath ?? "";
    if (!oldRoot) {
      result.skipped++;
      continue;
    }

    const relativePath = mf.filePath.startsWith(oldRoot)
      ? mf.filePath.slice(oldRoot.length)
      : mf.filePath;
    const newPath = path.join(newLibraryPath, relativePath);
    const newDir = path.dirname(newPath);

    try {
      // Check source exists
      await stat(mf.filePath);

      // Create target directory
      await mkdir(newDir, { recursive: true });

      // Move file (atomic rename on same filesystem)
      await rename(mf.filePath, newPath);

      // Update DB
      await updateMediaFile(db, mf.id, { filePath: newPath });
      result.migrated++;
    } catch (err) {
      const msg = `Failed to migrate "${mf.filePath}": ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      console.error(`[migrate-library] ${msg}`);
    }
  }

  return result;
}
