export interface IndexerResult {
  guid: string;
  title: string;
  size: number;
  publishDate: string;
  downloadUrl: string | null;
  magnetUrl: string | null;
  infoUrl: string | null;
  indexer: string;
  seeders: number;
  leechers: number;
  age: number;
  indexerFlags: string[];
  categories: Array<{ id: number; name: string }>;
}

export interface LiveData {
  state: string;
  progress: number;
  size: number;
  dlspeed: number;
  upspeed: number;
  eta: number;
  seeds: number;
  peers: number;
  addedOn: number;
  completedOn: number;
  ratio: number;
}
