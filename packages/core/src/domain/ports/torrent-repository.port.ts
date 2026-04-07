import type { torrent } from "@canto/db/schema";

type TorrentRow = typeof torrent.$inferSelect;
type TorrentInsert = typeof torrent.$inferInsert;

export interface TorrentRepositoryPort {
  findTorrentById(id: string): Promise<TorrentRow | undefined>;
  findTorrentByHash(hash: string): Promise<TorrentRow | undefined>;
  findTorrentByTitle(title: string): Promise<TorrentRow | undefined>;
  findTorrentsByMediaId(mediaId: string): Promise<TorrentRow[]>;
  findAllTorrents(): Promise<TorrentRow[]>;
  findAllTorrentsPaginated(limit: number, offset: number): Promise<TorrentRow[]>;
  countAllTorrents(): Promise<number>;
  createTorrent(data: TorrentInsert): Promise<TorrentRow | undefined>;
  updateTorrent(id: string, data: Partial<TorrentInsert>): Promise<TorrentRow | undefined>;
  deleteTorrent(id: string): Promise<void>;
  updateTorrentBatch(ids: string[], data: Partial<TorrentInsert>): Promise<void>;
  claimTorrentForImport(id: string): Promise<TorrentRow | undefined>;
  resetStaleImports(): Promise<void>;
  findUnimportedTorrents(): Promise<TorrentRow[]>;
}
