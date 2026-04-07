"use client";

import { trpc } from "~/lib/trpc/client";

/**
 * Fetches the logo for a single media item.
 * React Query caches the result per (provider, externalId).
 * httpBatchLink batches concurrent calls into one HTTP request.
 * Pass skip=true to disable the query (e.g. when logoPath is already available from browse).
 */
export function useLogo(
  provider: string | undefined,
  externalId: string | undefined,
  type: "movie" | "show",
  item: {
    title: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    year?: number | null;
    voteAverage?: number | null;
  },
  opts?: { skip?: boolean },
): string | null | undefined {
  const enabled = !!provider && !!externalId && !opts?.skip;

  const { data } = trpc.media.getLogo.useQuery(
    {
      // Safe fallback — query is disabled when externalId is undefined
      externalId: parseInt(externalId ?? "0", 10),
      provider: (provider ?? "tmdb") as "tmdb" | "tvdb",
      type,
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      year: item.year,
      voteAverage: item.voteAverage,
    },
    {
      enabled,
      staleTime: 24 * 60 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
    },
  );

  if (!enabled) return undefined;
  return data?.logoPath;
}
