import { unlink, rmdir } from "node:fs/promises";
import path from "node:path";

import { db } from "@canto/db/client";
import { getSettings } from "@canto/db/settings";
import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import {
  findTorrentByHash,
  updateTorrent,
} from "@canto/core/infra/repositories";

/**
 * Seed management: removes torrents from the download client once they've
 * exceeded the configured ratio or time limits. Optionally cleans up the
 * source files in the downloads folder (safe when hardlinks are used).
 */
export async function handleSeedManagement(): Promise<void> {
  const {
    "download.seedRatioLimit": ratioLimit,
    "download.seedTimeLimitHours": timeLimitHours,
    "download.seedCleanupFiles": cleanupFiles,
  } = await getSettings([
    "download.seedRatioLimit",
    "download.seedTimeLimitHours",
    "download.seedCleanupFiles",
  ]);

  // No limits configured — nothing to do
  if (ratioLimit == null && timeLimitHours == null) return;

  let client;
  try {
    client = await getDownloadClient();
  } catch {
    return; // Client not configured
  }

  const liveTorrents = await client.listTorrents();
  const now = Math.floor(Date.now() / 1000);
  let removed = 0;

  for (const torrent of liveTorrents) {
    // Only process completed torrents (uploading/seeding states)
    if (torrent.progress < 1) continue;

    // Check if this torrent is tracked, imported, and not currently being imported
    const dbRow = await findTorrentByHash(db, torrent.hash);
    if (!dbRow || !dbRow.imported || dbRow.importing) continue;

    let shouldRemove = false;

    // Check ratio limit
    if (ratioLimit != null && torrent.ratio >= ratioLimit) {
      shouldRemove = true;
    }

    // Check time limit
    if (timeLimitHours != null && torrent.completion_on > 0) {
      const seededSeconds = now - torrent.completion_on;
      if (seededSeconds >= timeLimitHours * 3600) {
        shouldRemove = true;
      }
    }

    if (!shouldRemove) continue;

    try {
      const shouldCleanup = cleanupFiles && dbRow.importMethod !== "remote";

      if (cleanupFiles && dbRow.importMethod === "remote") {
        console.log(
          `[seed-management] Skipping file cleanup for "${torrent.name}" — imported via remote mode (files are in the library path)`,
        );
      }

      // Fetch file list BEFORE deleting the torrent (it won't be available after)
      let filePaths: string[] = [];
      if (shouldCleanup) {
        const files = await client.getTorrentFiles(torrent.hash).catch(() => []);
        filePaths = files.map((f) => path.join(torrent.save_path, f.name));
      }

      // Remove torrent from client (keep files for now)
      await client.deleteTorrent(torrent.hash, false);

      // Update DB status
      await updateTorrent(db, dbRow.id, { status: "completed" });

      console.log(
        `[seed-management] Removed "${torrent.name}" (ratio: ${torrent.ratio.toFixed(2)}, seeded: ${torrent.completion_on > 0 ? Math.round((now - torrent.completion_on) / 3600) : "?"}h)`,
      );

      // Clean up source files in the downloads folder
      if (shouldCleanup) {
        try {
          const parentDirs = new Set<string>();

          for (const filePath of filePaths) {
            await unlink(filePath).catch(() => {});
            console.log(`[seed-management] Cleaned up file: ${filePath}`);
            parentDirs.add(path.dirname(filePath));
          }

          // Try to remove parent directories (only succeeds if empty)
          for (const dir of parentDirs) {
            // Don't try to remove the save_path root itself
            if (dir !== torrent.save_path) {
              await rmdir(dir).catch(() => {});
            }
          }
        } catch (err) {
          console.warn(`[seed-management] Cleanup failed for "${torrent.name}":`, err);
        }
      }

      removed++;
    } catch (err) {
      console.error(
        `[seed-management] Failed to remove "${torrent.name}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (removed > 0) {
    console.log(`[seed-management] Removed ${removed} torrent(s) that exceeded seed limits`);
  }
}
