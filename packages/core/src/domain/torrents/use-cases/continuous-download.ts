/* -------------------------------------------------------------------------- */
/*  Use-case: Continuous download — auto-grab next episode after import      */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import { applyAdminDownloadPolicy } from "@canto/core/domain/shared/rules/scoring-rules";
import type { IndexerPort } from "@canto/core/domain/torrents/ports/indexer";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import { downloadTorrent } from "@canto/core/domain/torrents/use-cases/download-torrent";
import { searchTorrents } from "@canto/core/domain/torrents/use-cases/search-torrents";

interface ContinuousDownloadMedia {
  id: string;
  type: string;
  continuousDownload: boolean;
  title: string;
}

export interface TryContinuousDownloadDeps {
  logger: LoggerPort;
  torrents: TorrentsRepositoryPort;
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
}

export async function tryContinuousDownload(
  db: Database,
  deps: TryContinuousDownloadDeps,
  mediaRow: ContinuousDownloadMedia,
  importedSeasonNumber: number | null,
  importedEpisodeNumbers: number[] | null,
  preferredQuality: { quality: string; source: string } | undefined,
  indexers: IndexerPort[],
  qbClient: DownloadClientPort,
): Promise<void> {
  if (mediaRow.type !== "show" || !mediaRow.continuousDownload) return;
  if (!importedEpisodeNumbers?.length || !importedSeasonNumber) return;

  const lastImportedEp = Math.max(...importedEpisodeNumbers);
  const nextEp = lastImportedEp + 1;

  deps.logger.info?.(
    `[continuous-download] Searching next episode S${String(importedSeasonNumber).padStart(2, "0")}E${String(nextEp).padStart(2, "0")} for "${mediaRow.title}"`,
  );

  try {
    const config = await deps.torrents.findDownloadConfig();
    const rules = applyAdminDownloadPolicy(config.rules, config.policy);
    const { results } = await searchTorrents(
      db,
      {
        mediaId: mediaRow.id,
        seasonNumber: importedSeasonNumber,
        episodeNumbers: [nextEp],
      },
      {
        indexers,
        rules,
        torrents: deps.torrents,
        media: deps.media,
        localization: deps.localization,
      },
    );

    if (results.length === 0) {
      deps.logger.info?.(`[continuous-download] No results for next episode`);
      return;
    }

    let best = results[0];
    if (!best) return;
    if (preferredQuality && preferredQuality.quality !== "unknown") {
      const matching = results.find(
        (r) =>
          r.quality === preferredQuality.quality &&
          (preferredQuality.source === "unknown" ||
            r.source === preferredQuality.source),
      );
      if (matching) best = matching;
    }
    deps.logger.info?.(
      `[continuous-download] Auto-downloading "${best.title}" (confidence: ${best.confidence})`,
    );

    await downloadTorrent(
      db,
      {
        logger: deps.logger,
        torrents: deps.torrents,
        media: deps.media,
      },
      {
        mediaId: mediaRow.id,
        title: best.title,
        magnetUrl: best.magnetUrl ?? undefined,
        torrentUrl: best.downloadUrl ?? undefined,
        seasonNumber: importedSeasonNumber,
        episodeNumbers: [nextEp],
      },
      qbClient,
    );
  } catch (err) {
    deps.logger.warn(`[continuous-download] Failed for "${mediaRow.title}"`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
