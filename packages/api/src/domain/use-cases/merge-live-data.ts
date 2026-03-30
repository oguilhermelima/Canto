import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { torrent } from "@canto/db/schema";
import { getQBClient } from "../../infrastructure/adapters/qbittorrent";
import type { LiveData } from "../types/torrent";
import { autoImportTorrent } from "./import-torrent";

type TorrentRow = Awaited<ReturnType<Database["query"]["torrent"]["findMany"]>>[number];

export async function mergeLiveData(
  db: Database,
  dbRows: TorrentRow[],
): Promise<Array<{ row: TorrentRow; live: LiveData | null }>> {
  let liveTorrents: Array<{
    hash: string;
    name: string;
    state: string;
    progress: number;
    size: number;
    dlspeed: number;
    upspeed: number;
    eta: number;
    num_seeds: number;
    num_leechs: number;
    added_on: number;
    completion_on: number;
    ratio: number;
    content_path: string;
    save_path: string;
  }> = [];
  let qbReachable = false;
  const qbImportClient = await getQBClient();

  try {
    liveTorrents = await qbImportClient.listTorrents();
    qbReachable = true;
  } catch {
    // qBittorrent may be unreachable
  }

  const liveMap = new Map(liveTorrents.map((t) => [t.hash, t]));

  // 1. Persist contentPath, fileSize, and progress
  for (const row of dbRows) {
    const live = row.hash ? liveMap.get(row.hash) : undefined;
    if (live) {
      const updates: Record<string, unknown> = {
        progress: live.progress,
        updatedAt: new Date(),
      };
      if (live.content_path && !row.contentPath) {
        updates.contentPath = live.content_path;
        (row as { contentPath: string | null }).contentPath = live.content_path;
      }
      if (live.size && !row.fileSize) {
        updates.fileSize = live.size;
        (row as { fileSize: number | null }).fileSize = live.size;
      }
      (row as { progress: number }).progress = live.progress;
      void db
        .update(torrent)
        .set(updates)
        .where(eq(torrent.id, row.id))
        .execute()
        .catch(() => {});
    }
  }

  // 2. Status transitions
  const statusUpdates = new Map<string, string>();

  for (const row of dbRows) {
    const live = row.hash ? liveMap.get(row.hash) : undefined;
    if (live && live.progress >= 1 && row.status !== "completed") {
      statusUpdates.set(row.id, "completed");
    } else if (
      !live &&
      row.hash &&
      qbReachable &&
      (row.status === "downloading" || row.status === "paused")
    ) {
      if (row.progress >= 1) {
        statusUpdates.set(row.id, "completed");
      } else {
        statusUpdates.set(row.id, "incomplete");
      }
    }
  }

  const byStatus = new Map<string, string[]>();
  for (const [id, status] of statusUpdates) {
    if (!byStatus.has(status)) byStatus.set(status, []);
    byStatus.get(status)!.push(id);
  }
  for (const [status, ids] of byStatus) {
    void db
      .update(torrent)
      .set({ status, updatedAt: new Date() })
      .where(inArray(torrent.id, ids))
      .execute()
      .catch(() => {});
  }

  // 3. Auto-import newly completed torrents
  const newlyCompleted = [...statusUpdates.entries()]
    .filter(([, s]) => s === "completed")
    .map(([id]) => id);

  if (newlyCompleted.length > 0) {
    const toImport = dbRows.filter(
      (r) => newlyCompleted.includes(r.id) && !r.imported && !r.importing && r.hash && r.mediaId,
    );
    for (const row of toImport) {
      void (async () => {
        try {
          const [claimed] = await db
            .update(torrent)
            .set({ importing: true })
            .where(and(eq(torrent.id, row.id), eq(torrent.importing, false)))
            .returning();
          if (!claimed) return;
          await autoImportTorrent(db, claimed, qbImportClient);
        } catch (err) {
          console.error(`[auto-import] Failed for "${row.title}":`, err instanceof Error ? err.message : err);
          await db.update(torrent).set({ importing: false }).where(eq(torrent.id, row.id)).catch(() => {});
        }
      })();
    }
  }

  // Update in-memory statuses
  for (const row of dbRows) {
    const newStatus = statusUpdates.get(row.id);
    if (newStatus) (row as { status: string }).status = newStatus;
  }

  return dbRows.map((row) => {
    const live = row.hash ? liveMap.get(row.hash) : undefined;
    return {
      row,
      live: live
        ? {
            state: live.state,
            progress: live.progress,
            size: live.size,
            dlspeed: live.dlspeed,
            upspeed: live.upspeed,
            eta: live.eta,
            seeds: live.num_seeds,
            peers: live.num_leechs,
            addedOn: live.added_on,
            completedOn: live.completion_on,
            ratio: live.ratio,
          }
        : null,
    };
  });
}
