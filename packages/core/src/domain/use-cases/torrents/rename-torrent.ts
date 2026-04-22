import type { Database } from "@canto/db/client";
import {
  findTorrentById,
  updateTorrent,
} from "../../../infra/repositories";
import { getQBClient } from "../../../infra/torrent-clients/qbittorrent.adapter";

/**
 * Rename a torrent's main file in qBittorrent.
 */
export async function renameTorrent(db: Database, torrentId: string, newName: string) {
  const row = await findTorrentById(db, torrentId);
  if (!row) return null;
  if (!row.hash) throw new Error("Torrent has no hash");

  const qb = await getQBClient();
  const files = await qb.getTorrentFiles(row.hash);
  if (files.length === 0) throw new Error("No files in torrent");

  const mainFile = files.reduce((a, b) => (a.size > b.size ? a : b));
  const ext = mainFile.name.includes(".") ? mainFile.name.slice(mainFile.name.lastIndexOf(".")) : "";
  const newPath = mainFile.name.includes("/")
    ? mainFile.name.slice(0, mainFile.name.lastIndexOf("/") + 1) + newName + ext
    : newName + ext;

  await qb.renameFile(row.hash, mainFile.name, newPath);
  await updateTorrent(db, torrentId, { title: newName });
  return { success: true };
}
