import type { Database } from "@canto/db/client";
import type { TmdbProvider } from "@canto/providers";

import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import { makeMediaExtrasRepository } from "@canto/core/infra/content-enrichment/media-extras-repository.adapter";

export interface SyncTmdbCertificationsDeps {
  extras?: MediaExtrasRepositoryPort;
}

/**
 * Pull the canonical certification catalog from TMDB and upsert into
 * `tmdb_certification`. Cheap (~2 API calls) and safe to re-run; called
 * lazily by the filter sidebar's tRPC endpoint when the table is empty
 * and surfaced as a manual button under /manage maintenance.
 *
 * Wave 9C threads the extras port (which surfaces the upsert helper)
 * through `deps`. Defaults to constructing the adapter off `db` so the
 * existing tRPC + admin-tools call sites keep working.
 */
export async function syncTmdbCertifications(
  db: Database,
  tmdb: TmdbProvider,
  deps: SyncTmdbCertificationsDeps = {},
): Promise<{ movie: number; tv: number }> {
  const extras = deps.extras ?? makeMediaExtrasRepository(db);

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

  await extras.upsertTmdbCertifications(rows);

  return { movie: movie.length, tv: tv.length };
}
