/* -------------------------------------------------------------------------- */
/*  Use-case: Auto-retry a stalled torrent with an alternative               */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import type { DownloadClientPort } from "../../shared/ports/download-client";
import type { IndexerPort } from "../ports/indexer";
import { searchTorrents } from "./search-torrents";
import { downloadTorrent } from "./download-torrent";
import {
  createBlocklistEntry,
  findDownloadById,
} from "../../../infra/repositories";
import { findDownloadConfig } from "../../../infra/torrents/download-config-repository";
import { applyAdminDownloadPolicy } from "../../shared/rules/scoring-rules";

interface StalledTorrent {
  id: string;
  title: string;
  mediaId: string | null;
  seasonNumber: number | null;
  episodeNumbers: number[] | null;
}

export async function retryStalledTorrent(
  db: Database,
  row: StalledTorrent,
  indexers: IndexerPort[],
  qbClient: DownloadClientPort,
): Promise<void> {
  if (!row.mediaId) return;

  // Blocklist the stalled torrent
  try {
    await createBlocklistEntry(db, {
      mediaId: row.mediaId,
      title: row.title,
      reason: "stalled",
    });
  } catch {
    // May already be blocklisted
  }

  // Remove stalled torrent from qBit
  try {
    const stalledRow = await findDownloadById(db, row.id);
    if (stalledRow?.hash) {
      await qbClient.deleteTorrent(stalledRow.hash, false);
    }
  } catch {
    // qBit may not have it
  }

  // Search for alternative
  if (indexers.length === 0) return;

  try {
    const config = await findDownloadConfig(db);
    const rules = applyAdminDownloadPolicy(config.rules, config.policy);
    const { results } = await searchTorrents(
      db,
      {
        mediaId: row.mediaId,
        seasonNumber: row.seasonNumber ?? undefined,
        episodeNumbers: row.episodeNumbers ?? undefined,
      },
      indexers,
      rules,
    );

    if (results.length === 0) {
      console.log(
        `[stall-detection] No alternative found for "${row.title}"`,
      );
      return;
    }

    const best = results[0]!;
    console.log(
      `[stall-detection] Auto-retrying with "${best.title}" (confidence: ${best.confidence})`,
    );

    await downloadTorrent(
      db,
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
    console.warn(
      `[stall-detection] Auto-retry failed for "${row.title}":`,
      err instanceof Error ? err.message : err,
    );
  }
}
