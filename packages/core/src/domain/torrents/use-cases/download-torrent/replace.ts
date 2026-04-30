import type { Database } from "@canto/db/client";

import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import { deleteMediaFile } from "@canto/core/infra/media/media-file-repository";
import { findDownloadByTitle } from "@canto/core/infra/torrents/download-repository";
import {
  coreDownload,
  type DownloadInput,
} from "@canto/core/domain/torrents/use-cases/download-torrent/core";

type TorrentRow = NonNullable<Awaited<ReturnType<typeof findDownloadByTitle>>>;

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
  input: ReplaceInput,
  qbClient: DownloadClientPort,
): Promise<TorrentRow> {
  for (const fileId of input.replaceFileIds) {
    await deleteMediaFile(db, fileId);
  }

  return coreDownload(db, input, { skipDedup: true }, qbClient);
}
