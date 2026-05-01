import type { Database } from "@canto/db/client";
import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { LiveData } from "@canto/core/domain/torrents/types/torrent";
import {
  updateDownload,
  updateDownloadBatch,
} from "@canto/core/infra/torrents/download-repository";

type TorrentRow = Awaited<ReturnType<Database["query"]["download"]["findMany"]>>[number];

export interface MergeLiveDataDeps {
  logger: LoggerPort;
}

export async function mergeLiveData(
  db: Database,
  deps: MergeLiveDataDeps,
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
      void updateDownload(db, row.id, updates).catch(deps.logger.logAndSwallow("merge-live-data updateDownload"));
    }
  }

  // 2. Status transitions
  const statusUpdates = new Map<string, string>();

  for (const row of dbRows) {
    const live = row.hash ? liveMap.get(row.hash) : undefined;
    if (live) {
      if (live.progress >= 1 && row.status !== "completed") {
        statusUpdates.set(row.id, "completed");
      } else if (live.state === "error" || live.state === "missingFiles") {
        if (row.status !== "error") statusUpdates.set(row.id, "error");
      } else if (live.state === "pausedDL") {
        if (row.status !== "paused") statusUpdates.set(row.id, "paused");
      } else if (live.state === "pausedUP") {
        if (row.status !== "completed") statusUpdates.set(row.id, "completed");
      } else if (live.state === "metaDL") {
        if (row.status !== "downloading") statusUpdates.set(row.id, "downloading");
      }
    } else if (
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
    void updateDownloadBatch(db, ids, { status }).catch(deps.logger.logAndSwallow("merge-live-data updateDownloadBatch"));
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
