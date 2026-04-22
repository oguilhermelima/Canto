import { resolveState } from "@/lib/torrent-utils";
import type { TorrentList } from "../_components/torrent-list";
import type { TorrentStatusCounts } from "../_components/torrent-tabs";

type TorrentRow = Parameters<typeof TorrentList>[0]["torrents"][number];

export function filterAndCountTorrents(
  torrents: TorrentRow[],
  statusFilter: string,
): { filtered: TorrentRow[]; counts: TorrentStatusCounts } {
  const counts: TorrentStatusCounts = {
    all: torrents.length,
    downloading: 0,
    completed: 0,
    paused: 0,
  };
  const filtered: TorrentRow[] = [];
  for (const t of torrents) {
    const r = resolveState(t.status, t.live?.state, t.live?.progress);
    const isDownloading = !r.isDownloaded && !r.canResume;
    const isPaused = r.canResume && !r.isDownloaded;
    if (isDownloading) counts.downloading++;
    if (r.isDownloaded) counts.completed++;
    if (isPaused) counts.paused++;
    if (
      statusFilter === "all" ||
      (statusFilter === "downloading" && isDownloading) ||
      (statusFilter === "completed" && r.isDownloaded) ||
      (statusFilter === "paused" && isPaused)
    ) {
      filtered.push(t);
    }
  }
  return { filtered, counts };
}
