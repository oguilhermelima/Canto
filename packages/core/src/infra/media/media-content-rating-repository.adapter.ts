import { eq, sql } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { mediaContentRating } from "@canto/db/schema";

import type { MediaContentRatingRepositoryPort } from "@canto/core/domain/media/ports/media-content-rating-repository.port";
import {
  toDomain as contentRatingToDomain,
  toRow as contentRatingToRow,
} from "@canto/core/infra/media/media-content-rating.mapper";

export function makeMediaContentRatingRepository(
  db: Database,
): MediaContentRatingRepositoryPort {
  return {
    findByMediaId: async (mediaId) => {
      const rows = await db
        .select()
        .from(mediaContentRating)
        .where(eq(mediaContentRating.mediaId, mediaId));
      return rows.map(contentRatingToDomain);
    },

    findByMediaIdAndRegion: async (mediaId, region) => {
      const [row] = await db
        .select()
        .from(mediaContentRating)
        .where(
          sql`${mediaContentRating.mediaId} = ${mediaId} AND ${mediaContentRating.region} = ${region}`,
        )
        .limit(1);
      return row ? contentRatingToDomain(row) : null;
    },

    countByMediaId: async (mediaId) => {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(mediaContentRating)
        .where(eq(mediaContentRating.mediaId, mediaId));
      return row?.n ?? 0;
    },

    upsertMany: async (rows) => {
      if (rows.length === 0) return;
      const seen = new Set<string>();
      const dedup = rows
        .map(contentRatingToRow)
        .filter((r) => {
          const key = `${r.mediaId}-${r.region}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      for (let i = 0; i < dedup.length; i += 500) {
        await db
          .insert(mediaContentRating)
          .values(dedup.slice(i, i + 500))
          .onConflictDoUpdate({
            target: [mediaContentRating.mediaId, mediaContentRating.region],
            set: { rating: sql`EXCLUDED.rating` },
          });
      }
    },
  };
}
