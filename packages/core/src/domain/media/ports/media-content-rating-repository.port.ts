import type {
  MediaContentRating,
  NewMediaContentRating,
} from "@canto/core/domain/media/types/media-content-rating";

/**
 * Port for the per-region content rating table. The cadence engine writes
 * via `upsertMany` from the shared TMDB metadata response, and read paths
 * resolve a user's preferred-region rating through `findByMediaIdAndRegion`.
 */
export interface MediaContentRatingRepositoryPort {
  // ─── Reads ───

  /** All content-rating rows for a media (every region). Used by the
   *  enrichment gap detector. */
  findByMediaId(mediaId: string): Promise<MediaContentRating[]>;

  /** Single row for a `(mediaId, region)` tuple. Returns `null` when no
   *  row exists. */
  findByMediaIdAndRegion(
    mediaId: string,
    region: string,
  ): Promise<MediaContentRating | null>;

  /** Batch sibling of `findByMediaIdAndRegion`. One row per `(mediaId, region)`
   *  match; missing pairs are simply absent from the result. */
  findByMediaIdsAndRegion(
    mediaIds: string[],
    region: string,
  ): Promise<MediaContentRating[]>;

  /** Number of content-rating rows persisted for a media — drives the
   *  cadence gap detector. */
  countByMediaId(mediaId: string): Promise<number>;

  // ─── Writes ───

  /**
   * Bulk upsert keyed on `(mediaId, region)`. Replaces the `rating` value on
   * conflict. Empty input is a no-op. Batched at 500 rows internally so very
   * large payloads don't exceed Postgres' parameter cap.
   */
  upsertMany(rows: NewMediaContentRating[]): Promise<void>;
}
