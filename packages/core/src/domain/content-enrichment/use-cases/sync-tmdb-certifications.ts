import type { TmdbProvider } from "@canto/providers";

import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";

export interface SyncTmdbCertificationsDeps {
  extras: MediaExtrasRepositoryPort;
}

/**
 * Pull the canonical certification catalog from TMDB and upsert into
 * `tmdb_certification`. Cheap (~2 API calls) and safe to re-run; called
 * lazily by the filter sidebar's tRPC endpoint when the table is empty
 * and surfaced as a manual button under /manage maintenance.
 */
export async function syncTmdbCertifications(
  tmdb: TmdbProvider,
  deps: SyncTmdbCertificationsDeps,
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

  await deps.extras.upsertTmdbCertifications(rows);

  return { movie: movie.length, tv: tv.length };
}
