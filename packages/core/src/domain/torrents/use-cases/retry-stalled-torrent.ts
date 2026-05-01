/* -------------------------------------------------------------------------- */
/*  Use-case: Auto-retry a stalled torrent with an alternative               */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import { applyAdminDownloadPolicy } from "@canto/core/domain/shared/rules/scoring-rules";
import type { IndexerPort } from "@canto/core/domain/torrents/ports/indexer";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import { downloadTorrent } from "@canto/core/domain/torrents/use-cases/download-torrent";
import { searchTorrents } from "@canto/core/domain/torrents/use-cases/search-torrents";

interface StalledTorrent {
  id: string;
  title: string;
  mediaId: string | null;
  seasonNumber: number | null;
  episodeNumbers: number[] | null;
}

export interface RetryStalledTorrentDeps {
  torrents: TorrentsRepositoryPort;
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  logger: LoggerPort;
}

export async function retryStalledTorrent(
  db: Database,
  deps: RetryStalledTorrentDeps,
  row: StalledTorrent,
  indexers: IndexerPort[],
  qbClient: DownloadClientPort,
): Promise<void> {
  if (!row.mediaId) return;

  try {
    await deps.torrents.createBlocklistEntry({
      mediaId: row.mediaId,
      title: row.title,
      reason: "stalled",
    });
  } catch {
    // May already be blocklisted
  }

  try {
    const stalledRow = await deps.torrents.findDownloadById(row.id);
    if (stalledRow?.hash) {
      await qbClient.deleteTorrent(stalledRow.hash, false);
    }
  } catch {
    // qBit may not have it
  }

  if (indexers.length === 0) return;

  try {
    const config = await deps.torrents.findDownloadConfig();
    const rules = applyAdminDownloadPolicy(config.rules, config.policy);
    const { results } = await searchTorrents(
      db,
      {
        mediaId: row.mediaId,
        seasonNumber: row.seasonNumber ?? undefined,
        episodeNumbers: row.episodeNumbers ?? undefined,
      },
      {
        indexers,
        rules,
        torrents: deps.torrents,
        media: deps.media,
        localization: deps.localization,
      },
    );

    const best = results[0];
    if (!best) {
      deps.logger.info?.(
        `[stall-detection] No alternative found for "${row.title}"`,
      );
      return;
    }

    deps.logger.info?.(
      `[stall-detection] Auto-retrying with "${best.title}" (confidence: ${best.confidence})`,
    );

    await downloadTorrent(
      db,
      {
        logger: deps.logger,
        torrents: deps.torrents,
        media: deps.media,
      },
      {
        mediaId: row.mediaId,
        title: best.title,
        magnetUrl: best.magnetUrl ?? undefined,
        torrentUrl: best.downloadUrl ?? undefined,
        seasonNumber: row.seasonNumber ?? undefined,
        episodeNumbers: row.episodeNumbers ?? undefined,
      },
      qbClient,
    );
  } catch (err) {
    deps.logger.warn(
      `[stall-detection] Auto-retry failed for "${row.title}"`,
      { error: err instanceof Error ? err.message : String(err) },
    );
  }
}
