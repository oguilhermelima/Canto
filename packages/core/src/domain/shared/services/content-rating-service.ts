import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaContentRating } from "@canto/db/schema";

/**
 * Override `contentRating` on a media row using the user's region. Falls back
 * to the existing value (US-derived during ingest) when no region-specific
 * row exists.
 */
export async function applyMediaContentRating<
  T extends { id: string; contentRating?: string | null },
>(db: Database, mediaRow: T, region: string | null | undefined): Promise<T> {
  if (!region || region === "US") return mediaRow;

  const row = await db.query.mediaContentRating.findFirst({
    where: and(
      eq(mediaContentRating.mediaId, mediaRow.id),
      eq(mediaContentRating.region, region),
    ),
  });

  if (!row) return mediaRow;

  return { ...mediaRow, contentRating: row.rating };
}

/**
 * Batch variant — apply region-specific ratings to a list of media rows in a
 * single query. Used by feeds/lists where N+1 would be unacceptable.
 */
export async function applyMediaContentRatings<
  T extends { id: string; contentRating?: string | null },
>(db: Database, mediaRows: T[], region: string | null | undefined): Promise<T[]> {
  if (!region || region === "US" || mediaRows.length === 0) return mediaRows;

  const ids = mediaRows.map((m) => m.id);
  const rows = await db.query.mediaContentRating.findMany({
    where: and(
      inArray(mediaContentRating.mediaId, ids),
      eq(mediaContentRating.region, region),
    ),
  });
  if (rows.length === 0) return mediaRows;

  const byMedia = new Map(rows.map((r) => [r.mediaId, r.rating]));
  return mediaRows.map((m) => {
    const rating = byMedia.get(m.id);
    return rating ? { ...m, contentRating: rating } : m;
  });
}
