/* -------------------------------------------------------------------------- */
/*  Use-case: Continuous download — auto-grab next episode after import      */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import type { DownloadClientPort } from "../../shared/ports/download-client";
import type { IndexerPort } from "../ports/indexer";
import { searchTorrents } from "./search-torrents";
import { downloadTorrent } from "./download-torrent";

interface ContinuousDownloadMedia {
  id: string;
  type: string;
  continuousDownload: boolean;
  title: string;
}

export async function tryContinuousDownload(
  db: Database,
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

  console.log(`[continuous-download] Searching next episode S${String(importedSeasonNumber).padStart(2, "0")}E${String(nextEp).padStart(2, "0")} for "${mediaRow.title}"`);

  try {
    const { results } = await searchTorrents(db, {
      mediaId: mediaRow.id,
      seasonNumber: importedSeasonNumber,
      episodeNumbers: [nextEp],
    }, indexers);

    if (results.length === 0) {
      console.log(`[continuous-download] No results for next episode`);
      return;
    }

    // Prefer results matching the quality/source of the previously imported episode
    let best = results[0]!;
    if (preferredQuality && preferredQuality.quality !== "unknown") {
      const matching = results.find(
        (r) => r.quality === preferredQuality.quality && (preferredQuality.source === "unknown" || r.source === preferredQuality.source),
      );
      if (matching) best = matching;
    }
    console.log(`[continuous-download] Auto-downloading "${best.title}" (confidence: ${best.confidence})`);

    await downloadTorrent(db, {
      mediaId: mediaRow.id,
      title: best.title,
      magnetUrl: best.magnetUrl ?? undefined,
      torrentUrl: best.downloadUrl ?? undefined,
      seasonNumber: importedSeasonNumber,
      episodeNumbers: [nextEp],
    }, qbClient);
  } catch (err) {
    console.warn(
      `[continuous-download] Failed for "${mediaRow.title}":`,
      err instanceof Error ? err.message : err,
    );
  }
}
