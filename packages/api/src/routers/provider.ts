import { z } from "zod";
import { isNotNull } from "drizzle-orm";

import { db } from "@canto/db/client";
import { watchProviderLink } from "@canto/db/schema";
import { getSetting, setSetting } from "@canto/db/settings";

import { createTRPCRouter, publicProcedure } from "../trpc";

/* -------------------------------------------------------------------------- */
/*  TMDB direct API helper                                                    */
/* -------------------------------------------------------------------------- */

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const apiKey = (await getSetting("tmdb.apiKey")) ?? "";
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

  /**
   * Get spotlight items for the home page hero.
   * Fetches trending movies + shows, then enriches with backdrops and logos.
   */
  spotlight: publicProcedure.query(async () => {
    const CACHE_KEY = "cache.spotlight";
    const ONE_HOUR_MS = 60 * 60 * 1000;

    const cached = await getSetting<{ data: unknown[]; updatedAt: string }>(CACHE_KEY);
    if (cached && Date.now() - new Date(cached.updatedAt).getTime() < ONE_HOUR_MS) {
      return cached.data as Array<{
        externalId: number;
        provider: string;
        type: "movie" | "show";
        title: string;
        overview: string;
        year: number | undefined;
        voteAverage: number;
        backdropPath: string;
        logoPath: string | null;
      }>;
    }

    const [moviesData, showsData] = await Promise.all([
      tmdbFetch<{
        results: Array<{
          id: number;
          title?: string;
          name?: string;
          overview: string;
          release_date?: string;
          first_air_date?: string;
          vote_average: number;
          popularity: number;
          backdrop_path: string | null;
        }>;
      }>("/trending/movie/week"),
      tmdbFetch<{
        results: Array<{
          id: number;
          title?: string;
          name?: string;
          overview: string;
          release_date?: string;
          first_air_date?: string;
          vote_average: number;
          popularity: number;
          backdrop_path: string | null;
        }>;
      }>("/trending/tv/week"),
    ]);

    const movies = moviesData.results.slice(0, 5).map((m) => ({
      externalId: m.id,
      type: "movie" as const,
      title: m.title ?? m.name ?? "",
      overview: m.overview,
      year: m.release_date ? new Date(m.release_date).getFullYear() : undefined,
      voteAverage: m.vote_average,
    }));

    const shows = showsData.results.slice(0, 5).map((s) => ({
      externalId: s.id,
      type: "show" as const,
      title: s.name ?? s.title ?? "",
      overview: s.overview,
      year: s.first_air_date ? new Date(s.first_air_date).getFullYear() : undefined,
      voteAverage: s.vote_average,
    }));

    // Interleave for variety
    const mixed: typeof movies = [];
    for (let i = 0; i < 5; i++) {
      if (shows[i]) mixed.push(shows[i]);
      if (movies[i]) mixed.push(movies[i]);
    }

    // Fetch backdrops + logos in parallel
    const results = await Promise.all(
      mixed.slice(0, 10).map(async (item) => {
        const tmdbType = item.type === "show" ? "tv" : "movie";
        try {
          const [detail, images] = await Promise.all([
            tmdbFetch<{ backdrop_path: string | null }>(`/${tmdbType}/${item.externalId}`),
            tmdbFetch<{
              logos: Array<{ file_path: string; iso_639_1: string | null }>;
            }>(`/${tmdbType}/${item.externalId}/images`, { include_image_language: "en,null" }),
          ]);

          const backdropPath = detail.backdrop_path;
          if (!backdropPath) return null;

          const enLogos = (images.logos ?? []).filter((l) => l.iso_639_1 === "en");
          const logoPath = enLogos.length > 0 ? enLogos[0]!.file_path : null;

          return {
            externalId: item.externalId,
            provider: "tmdb",
            type: item.type,
            title: item.title,
            overview: item.overview,
            year: item.year,
            voteAverage: item.voteAverage,
            backdropPath,
            logoPath,
          };
        } catch {
          return null;
        }
      }),
    );

    const spotlightResults = results.filter((r): r is NonNullable<typeof r> => r !== null);

    await setSetting(CACHE_KEY, {
      data: spotlightResults,
      updatedAt: new Date().toISOString(),
    });

    return spotlightResults;
  }),

  /**
   * Get watch provider search URL templates.
   * Returns Record<providerId, searchUrlTemplate> for providers with known search URLs.
   */
  watchProviderLinks: publicProcedure.query(async () => {
    const rows = await db
      .select({
        providerId: watchProviderLink.providerId,
        searchUrlTemplate: watchProviderLink.searchUrlTemplate,
      })
      .from(watchProviderLink)
      .where(isNotNull(watchProviderLink.searchUrlTemplate));

    const mapping: Record<number, string> = {};
    for (const row of rows) {
      mapping[row.providerId] = row.searchUrlTemplate!;
    }
    return mapping;
  }),
});
