import { unlink, rmdir } from "node:fs/promises";
import path from "node:path";

import { db } from "@canto/db/client";
import { getSettings } from "@canto/db/settings";
import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import {
  findDownloadsByHashes,
  updateDownloadBatch,
} from "@canto/core/infra/torrents/download-repository";
import { logAndSwallow } from "@canto/core/platform/logger/log-error";
import { runWithConcurrency } from "@canto/core/platform/concurrency/run-with-concurrency";

/** qBit's WebUI handles ~10 concurrent deletions without rate-limiting. */
const QBIT_DELETE_CONCURRENCY = 10;

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

  // Pre-filter to completed torrents and batch-load their DB rows.
  const completed = liveTorrents.filter((t) => t.progress >= 1);
  if (completed.length === 0) return;

  const dbRows = await findDownloadsByHashes(
    db,
    completed.map((t) => t.hash),
  );
  const dbByHash = new Map(
    dbRows.filter((r) => r.hash != null).map((r) => [r.hash as string, r]),
  );

  type Removal = {
    torrent: (typeof completed)[number];
    dbRow: (typeof dbRows)[number];
  };

  const toRemove: Removal[] = [];
  for (const torrent of completed) {
    const dbRow = dbByHash.get(torrent.hash);
    if (!dbRow || !dbRow.imported || dbRow.importing) continue;

    let shouldRemove = false;

    if (ratioLimit != null && torrent.ratio >= ratioLimit) {
      shouldRemove = true;
    }

    if (timeLimitHours != null && torrent.completion_on > 0) {
      const seededSeconds = now - torrent.completion_on;
      if (seededSeconds >= timeLimitHours * 3600) {
        shouldRemove = true;
      }
    }

    if (shouldRemove) toRemove.push({ torrent, dbRow });
  }

  if (toRemove.length === 0) return;

  const removedIds: string[] = [];

  await runWithConcurrency(toRemove, QBIT_DELETE_CONCURRENCY, async ({ torrent, dbRow }: Removal) => {
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
        const files = await client.getTorrentFiles(torrent.hash).catch((err) => {
          logAndSwallow(`seed-management:getTorrentFiles ${torrent.name}`)(err);
          return [];
        });
        filePaths = files.map((f) => path.join(torrent.save_path, f.name));
      }

      // Remove torrent from client (keep files for now)
      await client.deleteTorrent(torrent.hash, false);

      console.log(
        `[seed-management] Removed "${torrent.name}" (ratio: ${torrent.ratio.toFixed(2)}, seeded: ${torrent.completion_on > 0 ? Math.round((now - torrent.completion_on) / 3600) : "?"}h)`,
      );

      // Clean up source files in the downloads folder
      if (shouldCleanup) {
        try {
          const parentDirs = new Set<string>();

          for (const filePath of filePaths) {
            await unlink(filePath).catch(
              logAndSwallow(`seed-management:unlink ${filePath}`),
            );
            console.log(`[seed-management] Cleaned up file: ${filePath}`);
            parentDirs.add(path.dirname(filePath));
          }

          // Try to remove parent directories (only succeeds if empty)
          for (const dir of parentDirs) {
            // Don't try to remove the save_path root itself
            if (dir !== torrent.save_path) {
              await rmdir(dir).catch(
                logAndSwallow(`seed-management:rmdir ${dir}`),
              );
            }
          }
        } catch (err) {
          console.warn(`[seed-management] Cleanup failed for "${torrent.name}":`, err);
        }
      }

      removedIds.push(dbRow.id);
    } catch (err) {
      console.error(
        `[seed-management] Failed to remove "${torrent.name}":`,
        err instanceof Error ? err.message : err,
      );
    }
  });

  // Single batched DB write for all successful removals.
  if (removedIds.length > 0) {
    await updateDownloadBatch(db, removedIds, { status: "completed" });
    console.log(
      `[seed-management] Removed ${removedIds.length} torrent(s) that exceeded seed limits`,
    );
  }
}
