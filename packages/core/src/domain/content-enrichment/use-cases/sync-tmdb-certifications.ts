import { sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { tmdbCertification } from "@canto/db/schema";
import type { TmdbProvider } from "@canto/providers";

/**
 * Pull the canonical certification catalog from TMDB and upsert into
 * `tmdb_certification`. Cheap (~2 API calls) and safe to re-run; called
 * lazily by the filter sidebar's tRPC endpoint when the table is empty
 * and surfaced as a manual button under /manage maintenance.
 */
export async function syncTmdbCertifications(
  db: Database,
  tmdb: TmdbProvider,
): Promise<{ movie: number; tv: number }> {
  const [movie, tv] = await Promise.all([
    tmdb.getCertifications("movie"),
    tmdb.getCertifications("tv"),
  ]);

  const rows = [
    ...movie.map((c) => ({
      type: "movie" as const,
      region: c.region,
      rating: c.rating,
      meaning: c.meaning ?? null,
      sortOrder: c.order,
    })),
    ...tv.map((c) => ({
      type: "tv" as const,
      region: c.region,
      rating: c.rating,
      meaning: c.meaning ?? null,
      sortOrder: c.order,
    })),
  ];

  if (rows.length === 0) return { movie: 0, tv: 0 };

  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(tmdbCertification)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [tmdbCertification.type, tmdbCertification.region, tmdbCertification.rating],
        set: {
          meaning: sql`EXCLUDED.meaning`,
          sortOrder: sql`EXCLUDED.sort_order`,
          updatedAt: sql`NOW()`,
        },
      });
  }

  return { movie: movie.length, tv: tv.length };
}
