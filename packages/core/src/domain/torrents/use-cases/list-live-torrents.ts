import type { Database } from "@canto/db/client";
import type { DownloadClientPort } from "../../shared/ports/download-client";
import {
  findAllDownloadsPaginated,
  countAllDownloads,
} from "../../../infra/repositories";
import { findMediaById } from "../../../infra/media/media-repository";
import { findMediaLocalizedMany } from "../../../infra/media/media-localized-repository";
import { mergeLiveData } from "../../media/use-cases/merge-live-data";

/**
 * List live torrent data from qBittorrent merged with DB records + media info.
 * Supports offset-based pagination via cursor.
 */
export async function listLiveTorrents(
  db: Database,
  language: string,
  limit: number,
  offset: number,
  qb: DownloadClientPort,
) {
  const [dbRows, total] = await Promise.all([
    findAllDownloadsPaginated(db, limit, offset),
    countAllDownloads(db),
  ]);
  const merged = await mergeLiveData(db, dbRows, qb);

  // Batch-fetch linked media info; title/posterPath now live on
  // media_localization, so resolve them via the user's language with en-US
  // fallback in a single query.
  const mediaIds = [...new Set(dbRows.map((r) => r.mediaId).filter(Boolean))] as string[];
  const mediaMap = new Map<string, { id: string; title: string; posterPath: string | null; type: string; year: number | null; externalId: number }>();
  if (mediaIds.length > 0) {
    const localized = await findMediaLocalizedMany(db, mediaIds, language);
    const localizedById = new Map(localized.map((l) => [l.id, l]));
    for (const id of mediaIds) {
      const m = await findMediaById(db, id);
      if (m) {
        const loc = localizedById.get(id);
        mediaMap.set(m.id, {
          id: m.id,
          title: loc?.title ?? "",
          posterPath: loc?.posterPath ?? null,
          type: m.type,
          year: m.year,
          externalId: m.externalId,
        });
      }
    }
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
