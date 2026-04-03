import { z } from "zod";

import { db } from "@canto/db/client";
import { getSetting, setSetting } from "@canto/db/settings";
import { SETTINGS } from "../lib/settings-keys";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { getTmdbProvider } from "../lib/tmdb-client";
import { cached } from "../infrastructure/cache/redis";
import { findRecommendedMediaWithBackdrops, findWatchProviderLinks } from "../infrastructure/repositories/extras-repository";
import { findUserSpotlightItems } from "../infrastructure/repositories/user-recommendation-repository";
import { translateMediaItems } from "../domain/services/translation-service";
import { getUserLanguage } from "../domain/services/user-service";
import { buildExclusionSet } from "../domain/services/recommendation-service";
import { mapPoolItem } from "../domain/mappers/media-mapper";

/* -------------------------------------------------------------------------- */
/*  TMDB direct API helper                                                    */
/* -------------------------------------------------------------------------- */

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const apiKey = (await getSetting(SETTINGS.TMDB_API_KEY)) ?? "";
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
   * Unified filter options endpoint.
   * - type "regions": available watch provider regions
   * - type "watchProviders": streaming providers for a media type + region
   */
  filterOptions: publicProcedure
    .input(z.object({
      type: z.enum(["regions", "watchProviders"]),
      mediaType: z.enum(["movie", "show"]).optional(),
      region: z.string().length(2).optional(),
    }))
    .query(async ({ input }): Promise<
      | Array<{ code: string; englishName: string; nativeName: string }>
      | Array<{ providerId: number; providerName: string; logoPath: string; displayPriority: number }>
    > => {
      if (input.type === "regions") {
        return cached("provider:regions", 86400, async () => {
          const data = await tmdbFetch<{
            results: Array<{ iso_3166_1: string; english_name: string; native_name: string }>;
          }>("/watch/providers/regions");
          return data.results.map((r) => ({
            code: r.iso_3166_1,
            englishName: r.english_name,
            nativeName: r.native_name,
          }));
        });
      }

      const mediaType = input.mediaType ?? "movie";
      const region = input.region ?? "US";
      return cached(`provider:wp:${mediaType}:${region}`, 86400, async () => {
        const endpoint = mediaType === "movie" ? "/watch/providers/movie" : "/watch/providers/tv";
        const data = await tmdbFetch<{
          results: Array<{
            provider_id: number; provider_name: string; logo_path: string;
            display_priority: number; display_priorities: Record<string, number>;
          }>;
        }>(endpoint, { watch_region: region });
        return data.results.map((p) => ({
          providerId: p.provider_id, providerName: p.provider_name,
          logoPath: p.logo_path, displayPriority: p.display_priority,
        }));
      });
    }),

  /**
   * Unified filter search endpoint.
   * - type "networks": search TV networks on TMDB
   * - type "companies": search production companies on TMDB
   */
  filterSearch: publicProcedure
    .input(z.object({
      type: z.enum(["networks", "companies"]),
      query: z.string().min(1),
    }))
    .query(({ input }) => {
      const endpoint = input.type === "networks" ? "/search/network" : "/search/company";
      return cached(`provider:${input.type}:${input.query}`, 300, async () => {
        const data = await tmdbFetch<{
          results: Array<{ id: number; name: string; logo_path: string | null; origin_country: string }>;
        }>(endpoint, { query: input.query });
        return data.results.map((n) => ({
          id: n.id, name: n.name, logoPath: n.logo_path, originCountry: n.origin_country,
        }));
      });
    }),

  /**
   * Get per-user spotlight items for the home page hero.
   * Primary: user_recommendation with backdrops.
   * Fallback: global pool, then TMDB trending.
   */
  spotlight: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const userLang = await getUserLanguage(db, userId);
    const { excludeSet, excludeItems } = await buildExclusionSet(db, userId);

    // Path 1: Per-user spotlight
    const userItems = await findUserSpotlightItems(db, userId, excludeItems, 10);
    if (userItems.length > 0) {
      return translateMediaItems(db, userItems.map(mapPoolItem), userLang);
    }

    // Path 2: Global pool fallback
    const poolItems = await findRecommendedMediaWithBackdrops(db, 30);
    if (poolItems.length > 0) {
      const seen = new Set<string>();
      const unique = poolItems.filter((item) => {
        const key = `${item.provider ?? "tmdb"}-${item.externalId}`;
        if (seen.has(key) || excludeSet.has(key)) return false;
        seen.add(key);
        return true;
      });

      return translateMediaItems(db, unique.slice(0, 10).map(mapPoolItem), userLang);
    }

    // Path 3: TMDB trending fallback (fresh install)
    const CACHE_KEY = SETTINGS.CACHE_SPOTLIGHT;
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

    const mixed: Array<(typeof movies)[number] | (typeof shows)[number]> = [];
    for (let i = 0; i < 5; i++) {
      const show = shows[i];
      const movie = movies[i];
      if (show) mixed.push(show);
      if (movie) mixed.push(movie);
    }

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

    return translateMediaItems(db, spotlightResults, userLang);
  }),

  /**
   * Get all unified genres (provider-agnostic).
   */
  genres: publicProcedure
    .input(z.object({ type: z.enum(["movie", "show"]).default("movie") }).optional())
    .query(async ({ input }) => {
      const type = input?.type ?? "movie";
      const provider = await getTmdbProvider();
      return provider.getGenres(type);
    }),

  /**
   * Get watch provider search URL templates.
   * Returns Record<providerId, searchUrlTemplate> for providers with known search URLs.
   */
  watchProviderLinks: publicProcedure.query(async () => {
    const rows = await findWatchProviderLinks(db);

    const mapping: Record<number, string> = {};
    for (const row of rows) {
      mapping[row.providerId] = row.searchUrlTemplate!;
    }
    return mapping;
  }),
});
