import type { Database } from "@canto/db/client";
import type { DownloadClientPort } from "../../ports/download-client";
import {
  findAllTorrentsPaginated,
  countAllTorrents,
} from "../../../infrastructure/repositories/torrents";
import { findMediaById } from "../../../infrastructure/repositories/media-repository";
import { mergeLiveData } from "../merge-live-data";

/**
 * List live torrent data from qBittorrent merged with DB records + media info.
 * Supports offset-based pagination via cursor.
 */
export async function listLiveTorrents(
  db: Database,
  limit: number,
  offset: number,
  qb: DownloadClientPort,
) {
  const [dbRows, total] = await Promise.all([
    findAllTorrentsPaginated(db, limit, offset),
    countAllTorrents(db),
  ]);
  const merged = await mergeLiveData(db, dbRows, qb);

  // Batch-fetch linked media info
  const mediaIds = [...new Set(dbRows.map((r) => r.mediaId).filter(Boolean))] as string[];
  const mediaMap = new Map<string, { id: string; title: string; posterPath: string | null; type: string; year: number | null; externalId: number }>();
  for (const id of mediaIds) {
    const m = await findMediaById(db, id);
    if (m) mediaMap.set(m.id, { id: m.id, title: m.title, posterPath: m.posterPath, type: m.type, year: m.year, externalId: m.externalId });
  }

  return {
    items: merged.map((item) => ({
      ...item.row,
      media: item.row.mediaId ? mediaMap.get(item.row.mediaId) ?? null : null,
      live: item.live,
    })),
    total,
  };
}
