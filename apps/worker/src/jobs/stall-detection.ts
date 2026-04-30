import { db } from "@canto/db/client";
import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import { buildIndexers } from "@canto/core/infra/indexers/indexer-factory";
import { createNotification } from "@canto/core/domain/notifications/use-cases/create-notification";
import { makeNotificationsRepository } from "@canto/core/infra/notifications/notifications-repository.adapter";
import { retryStalledTorrent } from "@canto/core/domain/torrents/use-cases/retry-stalled-torrent";
import { makeTorrentsRepository } from "@canto/core/infra/torrents/torrents-repository.adapter";
import {
  findDownloadsByStatus,
  updateDownload,
} from "@canto/core/infra/torrents/download-repository";

/** How long a torrent must be downloading with no progress before we consider it stalled (ms) */
const STALL_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Detect stalled downloads and optionally auto-retry with next-best result.
 *
 * A torrent is considered stalled if:
 * 1. DB status is "downloading"
 * 2. qBittorrent reports state "stalledDL"
 * 3. It was created more than STALL_THRESHOLD_MS ago
 */
export async function handleStallDetection(): Promise<void> {
  const qb = await getDownloadClient();

  let liveTorrents: Array<{ hash: string; state: string; progress: number }>;
  try {
    liveTorrents = await qb.listTorrents();
  } catch {
    console.warn("[stall-detection] qBittorrent unreachable, skipping");
    return;
  }

  const liveMap = new Map(liveTorrents.map((t) => [t.hash, t]));
  // Filter at the DB layer using download.status — avoids loading completed/failed
  // rows we'd discard in the next line anyway.
  const downloadingRows = await findDownloadsByStatus(db, "downloading");

  const now = Date.now();
  const stalled: typeof downloadingRows = [];

  for (const row of downloadingRows) {
    if (!row.hash) continue;

    const live = liveMap.get(row.hash);
    if (!live) continue;

    if (live.state !== "stalledDL") continue;

    const createdAt = new Date(row.createdAt).getTime();
    if (now - createdAt < STALL_THRESHOLD_MS) continue;

    stalled.push(row);
  }

  if (stalled.length === 0) return;

  console.log(
    `[stall-detection] Found ${stalled.length} stalled torrent(s)`,
  );

  const indexers = await buildIndexers();
  const notificationsRepo = makeNotificationsRepository(db);

  for (const row of stalled) {
    try {
      // Mark as stalled
      await updateDownload(db, row.id, { status: "stalled" });

      // Create notification
      await createNotification(
        { repo: notificationsRepo },
        {
          title: "Download stalled",
          message: `"${row.title}" has been stalled for over an hour.`,
          type: "download_stalled",
          mediaId: row.mediaId,
        },
      );

      // Auto-retry: search for alternative and download
      if (row.mediaId) {
        await retryStalledTorrent(
          db,
          { torrents: makeTorrentsRepository(db) },
          row,
          indexers,
          qb,
        );
      }
    } catch (err) {
      console.error(
        `[stall-detection] Error handling "${row.title}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
