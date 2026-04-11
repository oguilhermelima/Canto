export interface DownloadClientPort {
  addTorrent(url: string, category?: string, savePath?: string): Promise<void>;
  listTorrents(filter?: { hashes?: string[] }): Promise<TorrentInfo[]>;
  getTorrentFiles(hash: string): Promise<TorrentFileInfo[]>;
  pauseTorrent(hash: string): Promise<void>;
  resumeTorrent(hash: string): Promise<void>;
  deleteTorrent(hash: string, deleteFiles: boolean): Promise<void>;
  ensureCategory(category: string, savePath?: string): Promise<void>;
  createCategory(category: string, savePath?: string): Promise<void>;
  editCategory(category: string, savePath: string): Promise<void>;
  removeCategories(categories: string[]): Promise<void>;
  setCategory(hash: string, category: string): Promise<void>;
  testConnection(): Promise<{ name: string; version: string }>;

  /** List all configured categories with their save paths. */
  listCategories(): Promise<Record<string, { name: string; savePath: string }>>;
  /** Get the default save path configured in the download client. */
  getDefaultSavePath(): Promise<string>;

  /** Move torrent data to a new location (used in remote import mode). */
  setLocation(hash: string, location: string): Promise<void>;
  /** Rename a file within a torrent (used in remote import mode). */
  renameFile(hash: string, oldPath: string, newPath: string): Promise<void>;
}

export interface TorrentInfo {
  hash: string;
  name: string;
  state: string;
  progress: number;
  size: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  save_path: string;
  category: string;
  content_path: string;
  num_seeds: number;
  num_leechs: number;
  added_on: number;
  completion_on: number;
  ratio: number;
}

export interface TorrentFileInfo {
  index: number;
  name: string;
  size: number;
  progress: number;
}
