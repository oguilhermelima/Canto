import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import { MissingDownloadUrlError } from "@canto/core/domain/torrents/errors";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";

export interface RetryTorrentDeps {
  torrents: TorrentsRepositoryPort;
  folders: FoldersRepositoryPort;
  media: MediaRepositoryPort;
}

/**
 * Re-download a torrent that was removed or errored.
 * Resolves the correct qBittorrent category and re-adds the torrent.
 */
export async function retryTorrent(
  deps: RetryTorrentDeps,
  torrentId: string,
  qb: DownloadClientPort,
) {
  const row = await deps.torrents.findDownloadById(torrentId);
  if (!row) return null;

  const url = row.magnetUrl ?? row.downloadUrl;
  if (!url) throw new MissingDownloadUrlError();

  const linkedMedia = row.mediaId ? await deps.media.findById(row.mediaId) : null;
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
