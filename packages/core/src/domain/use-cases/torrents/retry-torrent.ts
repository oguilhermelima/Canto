import type { Database } from "@canto/db/client";
import type { DownloadClientPort } from "../../ports/download-client";
import {
  findTorrentById,
  updateTorrent,
} from "../../../infrastructure/repositories/torrents";
import { findMediaById } from "../../../infrastructure/repositories/media/media-repository";
import { findFolderById, findDefaultFolder } from "../../../infrastructure/repositories/file-organization/folder";

/**
 * Re-download a torrent that was removed or errored.
 * Resolves the correct qBittorrent category and re-adds the torrent.
 */
export async function retryTorrent(db: Database, torrentId: string, qb: DownloadClientPort) {
  const row = await findTorrentById(db, torrentId);
  if (!row) return null;

  const url = row.magnetUrl ?? row.downloadUrl;
  if (!url) throw new Error("No download URL saved for this torrent.");

  const linkedMedia = row.mediaId ? await findMediaById(db, row.mediaId) : null;
  let retryCategory: string;
  if (linkedMedia?.libraryId) {
    const folder = await findFolderById(db, linkedMedia.libraryId);
    retryCategory = folder?.qbitCategory ?? "default";
  } else {
    const folder = await findDefaultFolder(db);
    retryCategory = folder?.qbitCategory ?? "default";
  }

  await qb.addTorrent(url, retryCategory);

  let newHash = row.hash;
  if (!newHash && url.startsWith("magnet:")) {
    const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(url);
    if (match?.[1]) newHash = match[1].toLowerCase();
  }

  return updateTorrent(db, torrentId, { hash: newHash, status: "downloading", progress: 0 });
}
