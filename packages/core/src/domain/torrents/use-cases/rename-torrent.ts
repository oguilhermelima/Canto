import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import {
  TorrentEmptyError,
  TorrentMissingHashError,
} from "@canto/core/domain/torrents/errors";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";

/**
 * Rename a torrent's main file in qBittorrent.
 */
export async function renameTorrent(
  deps: { repo: TorrentsRepositoryPort; client: DownloadClientPort },
  torrentId: string,
  newName: string,
) {
  const row = await deps.repo.findDownloadById(torrentId);
  if (!row) return null;
  if (!row.hash) throw new TorrentMissingHashError();

  const files = await deps.client.getTorrentFiles(row.hash);
  if (files.length === 0) throw new TorrentEmptyError();

  const mainFile = files.reduce((a, b) => (a.size > b.size ? a : b));
  const ext = mainFile.name.includes(".")
    ? mainFile.name.slice(mainFile.name.lastIndexOf("."))
    : "";
  const newPath = mainFile.name.includes("/")
    ? mainFile.name.slice(0, mainFile.name.lastIndexOf("/") + 1) + newName + ext
    : newName + ext;

  await deps.client.renameFile(row.hash, mainFile.name, newPath);
  await deps.repo.updateDownload(torrentId, { title: newName });
  return { success: true };
}
