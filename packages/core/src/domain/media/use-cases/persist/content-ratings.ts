import { sql } from "drizzle-orm";

import type { NormalizedMedia } from "@canto/providers";
import { mediaContentRating } from "@canto/db/schema";
import type { Database } from "@canto/db/client";

/**
 * Persist per-region content ratings for a media row. Mirrors the translation
 * pattern: one row per (mediaId, region), upsert on conflict.
 */
export async function persistContentRatings(
  db: Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<void> {
  if (!normalized.contentRatings || normalized.contentRatings.length === 0) {
    return;
  }

  const seen = new Set<string>();
  const rows = normalized.contentRatings
    .filter((r) => r.region && r.rating)
    .map((r) => ({ mediaId, region: r.region, rating: r.rating }))
    .filter((r) => {
      const key = `${r.mediaId}-${r.region}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(mediaContentRating)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [mediaContentRating.mediaId, mediaContentRating.region],
        set: { rating: sql`EXCLUDED.rating` },
      });
  }
}
