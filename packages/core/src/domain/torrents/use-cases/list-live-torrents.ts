import type { Database } from "@canto/db/client";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import { mergeLiveData } from "@canto/core/domain/media/use-cases/merge-live-data";
import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";

export interface ListLiveTorrentsDeps {
  logger: LoggerPort;
  torrents: TorrentsRepositoryPort;
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
}

/**
 * List live torrent data from qBittorrent merged with DB records + media info.
 * Supports offset-based pagination via cursor.
 */
export async function listLiveTorrents(
  db: Database,
  deps: ListLiveTorrentsDeps,
  language: string,
  limit: number,
  offset: number,
  qb: DownloadClientPort,
) {
  const [dbRows, total] = await Promise.all([
    deps.torrents.findAllDownloadsPaginated(limit, offset),
    deps.torrents.countAllDownloads(),
  ]);
  // mergeLiveData lives in the media context and still types its input as
  // the raw drizzle download row. The domain Download we feed it carries the
  // same field shape — see W10.8 for the cross-context realignment.
  const merged = await mergeLiveData(
    db,
    deps,
    dbRows as unknown as Parameters<typeof mergeLiveData>[2],
    qb,
  );

  const mediaIds = [
    ...new Set(dbRows.map((r) => r.mediaId).filter(Boolean)),
  ] as string[];
  const mediaMap = new Map<
    string,
    {
      id: string;
      title: string;
      posterPath: string | null;
      type: string;
      year: number | null;
      externalId: number;
    }
  >();
  if (mediaIds.length > 0) {
    const localized = await deps.localization.findLocalizedManyByIds(
      mediaIds,
      language,
    );
    const localizedById = new Map(localized.map((l) => [l.id, l]));
    for (const id of mediaIds) {
      const m = await deps.media.findById(id);
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
      media: item.row.mediaId ? (mediaMap.get(item.row.mediaId) ?? null) : null,
      live: item.live,
    })),
    total,
  };
}
