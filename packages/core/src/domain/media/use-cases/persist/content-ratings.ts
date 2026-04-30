import type { NormalizedMedia } from "@canto/providers";

import type { MediaContentRatingRepositoryPort } from "@canto/core/domain/media/ports/media-content-rating-repository.port";

interface PersistContentRatingsDeps {
  contentRating: MediaContentRatingRepositoryPort;
}

/**
 * Persist per-region content ratings for a media row via the content-rating
 * port. The port handles deduplication + 500-row batching internally.
 */
export async function persistContentRatings(
  mediaId: string,
  normalized: NormalizedMedia,
  opts: { deps: PersistContentRatingsDeps },
): Promise<void> {
  if (!normalized.contentRatings || normalized.contentRatings.length === 0) {
    return;
  }

  const rows = normalized.contentRatings
    .filter((r) => r.region && r.rating)
    .map((r) => ({ mediaId, region: r.region, rating: r.rating }));

  if (rows.length === 0) return;

  await opts.deps.contentRating.upsertMany(rows);
}
