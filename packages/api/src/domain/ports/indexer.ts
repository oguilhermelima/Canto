import type { IndexerResult, SearchContext } from "../types/torrent";

export interface IndexerPort {
  search(ctx: SearchContext): Promise<IndexerResult[]>;
}
