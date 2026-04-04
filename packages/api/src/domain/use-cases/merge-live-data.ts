import type { Database } from "@canto/db/client";
import type { DownloadClientPort } from "../ports/download-client";
import type { LiveData } from "../types/torrent";
import { autoImportTorrent } from "./import-torrent";
import {
  updateTorrent,
  updateTorrentBatch,
  claimTorrentForImport,
} from "../../infrastructure/repositories";
import { logAndSwallow } from "../../lib/log-error";

type TorrentRow = Awaited<ReturnType<Database["query"]["torrent"]["findMany"]>>[number];

export async function mergeLiveData(
  db: Database,
  dbRows: TorrentRow[],
  qbClient: DownloadClientPort,
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

  try {
    liveTorrents = await qbClient.listTorrents();
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
      void updateTorrent(db, row.id, updates).catch(logAndSwallow("merge-live-data updateTorrent"));
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
    void updateTorrentBatch(db, ids, { status }).catch(logAndSwallow("merge-live-data updateTorrentBatch"));
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
          const claimed = await claimTorrentForImport(db, row.id);
          if (!claimed) return;
          await autoImportTorrent(db, claimed, qbClient);
        } catch (err) {
          console.error(`[auto-import] Failed for "${row.title}":`, err instanceof Error ? err.message : err);
          await updateTorrent(db, row.id, { importing: false }).catch(logAndSwallow("merge-live-data reset importing flag"));
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
