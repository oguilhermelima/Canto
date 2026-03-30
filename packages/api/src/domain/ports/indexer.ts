import type { IndexerResult } from "../types/torrent";

export interface IndexerPort {
  search(query: string): Promise<IndexerResult[]>;
}
