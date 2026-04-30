import type {
  IndexerResult,
  SearchContext,
} from "@canto/core/domain/torrents/types/torrent";

export interface IndexerPort {
  /** Stable identifier ("prowlarr" / "jackett"). Used by the per-indexer
   *  search procedure to locate this source. */
  readonly id: string;
  /** Human-readable display name for the UI. */
  readonly name: string;
  search(ctx: SearchContext): Promise<IndexerResult[]>;
}
