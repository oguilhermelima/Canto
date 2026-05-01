import path from "node:path";

import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import { TorrentNotFoundInClientError } from "@canto/core/domain/torrents/errors";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import type { ParsedFile } from "@canto/core/domain/torrents/rules/parse-video-files";

/**
 * Resolve the save path qBittorrent reports for a given hash. Used to locate
 * the source files before hardlinking / copying on local import.
 */
export async function resolveSavePath(
  client: DownloadClientPort,
  hash: string,
): Promise<string> {
  const torrents = await client.listTorrents({ hashes: [hash] });
  const torrent = torrents[0];
  if (!torrent) throw new TorrentNotFoundInClientError(hash);
  return path.normalize(torrent.save_path);
}

/**
 * Upsert a `media_file` row for a single parsed file. If a pending placeholder
 * matches the episode (or movie), update it in place; otherwise insert a new
 * row. Files that were already imported on a previous attempt are skipped so
 * retries don't create duplicates.
 *
 * Returns 1 when a row was written (either updated or inserted), 0 otherwise.
 */
export async function upsertMediaFile(
  torrents: TorrentsRepositoryPort,
  pf: ParsedFile,
  finalPath: string,
  placeholders: Array<{ id: string; episodeId: string | null }>,
  alreadyImported: Array<{ id: string; episodeId: string | null }>,
  mediaRow: { id: string },
  torrentRow: { id: string; quality: string; source: string },
): Promise<number> {
  if (pf.episodeId) {
    const existing = alreadyImported.find((f) => f.episodeId === pf.episodeId);
    if (existing) return 1;
  } else {
    const existing = alreadyImported.find((f) => !f.episodeId);
    if (existing) return 1;
  }

  if (pf.episodeId) {
    const placeholder = placeholders.find((p) => p.episodeId === pf.episodeId);
    if (placeholder) {
      await torrents.updateMediaFile(placeholder.id, {
        filePath: finalPath,
        sizeBytes: pf.file.size,
        status: "imported",
      });
      return 1;
    }
    await torrents.createMediaFileNoConflict({
      mediaId: mediaRow.id,
      episodeId: pf.episodeId,
      downloadId: torrentRow.id,
      filePath: finalPath,
      quality: torrentRow.quality,
      source: torrentRow.source,
      sizeBytes: pf.file.size,
      status: "imported",
    });
    return 1;
  }

  if (mediaRow.id) {
    const placeholder = placeholders.find((p) => !p.episodeId);
    if (placeholder) {
      await torrents.updateMediaFile(placeholder.id, {
        filePath: finalPath,
        sizeBytes: pf.file.size,
        status: "imported",
      });
      return 1;
    }
    await torrents.createMediaFileNoConflict({
      mediaId: mediaRow.id,
      downloadId: torrentRow.id,
      filePath: finalPath,
      quality: torrentRow.quality,
      source: torrentRow.source,
      sizeBytes: pf.file.size,
      status: "imported",
    });
    return 1;
  }

  return 0;
}
