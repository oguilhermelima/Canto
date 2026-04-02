export interface TorrentClientPort {
  addTorrent(url: string, category?: string, savePath?: string): Promise<void>;
  listTorrents(): Promise<TorrentInfo[]>;
  pauseTorrent(hash: string): Promise<void>;
  resumeTorrent(hash: string): Promise<void>;
  deleteTorrent(hash: string, deleteFiles: boolean): Promise<void>;
  setCategory(hash: string, category: string): Promise<void>;
  getTorrentFiles(hash: string): Promise<TorrentFileInfo[]>;
  setLocation(hash: string, location: string): Promise<void>;
  renameFile(hash: string, oldPath: string, newPath: string): Promise<void>;
  ensureCategory(category: string, savePath?: string): Promise<void>;
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
