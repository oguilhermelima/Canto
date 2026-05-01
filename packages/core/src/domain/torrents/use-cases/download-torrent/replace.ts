import type { Database } from "@canto/db/client";

import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import {
  coreDownload,
} from "@canto/core/domain/torrents/use-cases/download-torrent/core";
import type {
  DownloadInput,
  DownloadTorrentDeps,
  TorrentRow,
} from "@canto/core/domain/torrents/use-cases/download-torrent/core";

export interface ReplaceInput extends DownloadInput {
  replaceFileIds: string[];
}

/**
 * Replace existing media_file records and re-download with a new torrent.
 * Deletes the specified old files first, then runs the download flow
 * without dedup checks (since we just removed the files being replaced).
 */
export async function replaceTorrent(
  db: Database,
  deps: DownloadTorrentDeps,
  input: ReplaceInput,
  qbClient: DownloadClientPort,
): Promise<TorrentRow> {
  for (const fileId of input.replaceFileIds) {
    await deps.torrents.deleteMediaFile(fileId);
  }

  return coreDownload(db, deps, input, { skipDedup: true }, qbClient);
}
