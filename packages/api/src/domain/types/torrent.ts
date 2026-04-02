export interface SearchContext {
  query: string;
  mediaType: "movie" | "show";
  tmdbId?: number;
  imdbId?: string;
  tvdbId?: number;
  seasonNumber?: number;
  episodeNumbers?: number[];
  categories?: number[];
  /** Per-indexer result limit (Torznab `limit` param) */
  limit?: number;
  /** Per-indexer result offset (Torznab `offset` param) */
  offset?: number;
}

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
