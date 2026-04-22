import type { Database } from "@canto/db/client";

import type { DownloadClientPort } from "../../../shared/ports/download-client";
import {
  deleteMediaFile,
  findTorrentByTitle,
} from "../../../../infra/repositories";
import { coreDownload, type DownloadInput } from "./core";

type TorrentRow = NonNullable<Awaited<ReturnType<typeof findTorrentByTitle>>>;

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
