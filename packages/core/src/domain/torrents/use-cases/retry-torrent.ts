import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import { findMediaById } from "@canto/core/infra/media/media-repository";
import type { Database } from "@canto/db/client";

/**
 * Re-download a torrent that was removed or errored.
 * Resolves the correct qBittorrent category and re-adds the torrent.
 */
export async function retryTorrent(
  db: Database,
  deps: {
    torrents: TorrentsRepositoryPort;
    folders: FoldersRepositoryPort;
  },
  torrentId: string,
  qb: DownloadClientPort,
) {
  const row = await deps.torrents.findDownloadById(torrentId);
  if (!row) return null;

  const url = row.magnetUrl ?? row.downloadUrl;
  if (!url) throw new Error("No download URL saved for this torrent.");

  const linkedMedia = row.mediaId ? await findMediaById(db, row.mediaId) : null;
  let retryCategory: string;
  if (linkedMedia?.libraryId) {
    const folder = await deps.folders.findFolderById(linkedMedia.libraryId);
    retryCategory = folder?.qbitCategory ?? "default";
  } else {
    const folder = await deps.folders.findDefaultFolder();
    retryCategory = folder?.qbitCategory ?? "default";
  }

  await qb.addTorrent(url, retryCategory);

  let newHash = row.hash;
  if (!newHash && url.startsWith("magnet:")) {
    const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(url);
    if (match?.[1]) newHash = match[1].toLowerCase();
  }

  return deps.torrents.updateDownload(torrentId, {
    hash: newHash,
    status: "downloading",
    progress: 0,
  });
}
