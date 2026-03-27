import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "../trpc";

/* -------------------------------------------------------------------------- */
/*  TMDB direct API helper                                                    */
/* -------------------------------------------------------------------------- */

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY ?? "";
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `TMDB API error: ${response.status} ${response.statusText} — ${path} — ${body}`,
    );
  }

  return response.json() as Promise<T>;
}

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const providerRouter = createTRPCRouter({
  /**
   * Get available watch provider regions from TMDB.
   */
  regions: publicProcedure.query(async () => {
    const data = await tmdbFetch<{
      results: Array<{
        iso_3166_1: string;
        english_name: string;
        native_name: string;
      }>;
    }>("/watch/providers/regions");

    return data.results.map((r) => ({
      code: r.iso_3166_1,
      englishName: r.english_name,
      nativeName: r.native_name,
    }));
  }),

  /**
   * Get watch (streaming) providers for a given media type and region.
   */
  watchProviders: publicProcedure
    .input(
      z.object({
        type: z.enum(["movie", "show"]),
        region: z.string().length(2),
      }),
    )
    .query(async ({ input }) => {
      const endpoint =
        input.type === "movie"
          ? "/watch/providers/movie"
          : "/watch/providers/tv";

      const data = await tmdbFetch<{
        results: Array<{
          provider_id: number;
          provider_name: string;
          logo_path: string;
          display_priority: number;
          display_priorities: Record<string, number>;
        }>;
      }>(endpoint, { watch_region: input.region });

      return data.results.map((p) => ({
        providerId: p.provider_id,
        providerName: p.provider_name,
        logoPath: p.logo_path,
        displayPriority: p.display_priority,
      }));
    }),

  /**
   * Search TV networks on TMDB.
   */
  networks: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const data = await tmdbFetch<{
        results: Array<{
          id: number;
          name: string;
          logo_path: string | null;
          origin_country: string;
        }>;
      }>("/search/network", { query: input.query });

      return data.results.map((n) => ({
        id: n.id,
        name: n.name,
        logoPath: n.logo_path,
        originCountry: n.origin_country,
      }));
    }),

  /**
   * Search production companies on TMDB.
   */
  companies: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const data = await tmdbFetch<{
        results: Array<{
          id: number;
          name: string;
          logo_path: string | null;
          origin_country: string;
        }>;
      }>("/search/company", { query: input.query });

      return data.results.map((c) => ({
        id: c.id,
        name: c.name,
        logoPath: c.logo_path,
        originCountry: c.origin_country,
      }));
    }),
});
