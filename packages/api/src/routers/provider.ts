import {
  filterOptionsInput,
  filterSearchInput,
  genresInput,
} from "@canto/validators";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import { cached } from "@canto/core/infrastructure/cache/redis";
import { findWatchProviderLinks } from "@canto/core/infrastructure/repositories/extras-repository";
import { user } from "@canto/db/schema";

// ── Extracted use-case ──
import { getSpotlight } from "@canto/core/domain/use-cases/get-spotlight";

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const providerRouter = createTRPCRouter({
  filterOptions: publicProcedure
    .input(filterOptionsInput)
    .query(async ({ input }): Promise<
      | Array<{ code: string; englishName: string; nativeName: string }>
      | Array<{ providerId: number; providerName: string; logoPath: string; displayPriority: number }>
    > => {
      const tmdb = await getTmdbProvider();

      if (input.type === "regions") {
        return cached("provider:regions", 86400, async () => {
          const data = await fetchFromTmdb<{
            results: Array<{ iso_3166_1: string; english_name: string; native_name: string }>;
          }>(tmdb, "/watch/providers/regions");
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
        const data = await fetchFromTmdb<{
          results: Array<{
            provider_id: number; provider_name: string; logo_path: string;
            display_priority: number; display_priorities: Record<string, number>;
          }>;
        }>(tmdb, endpoint, { watch_region: region });
        return data.results.map((p) => ({
          providerId: p.provider_id, providerName: p.provider_name,
          logoPath: p.logo_path, displayPriority: p.display_priority,
        }));
      });
    }),

  filterSearch: publicProcedure
    .input(filterSearchInput)
    .query(({ input }) => {
      const endpoint = input.type === "networks" ? "/search/network" : "/search/company";
      return cached(`provider:${input.type}:${input.query}`, 300, async () => {
        const tmdb = await getTmdbProvider();
        const data = await fetchFromTmdb<{
          results: Array<{ id: number; name: string; logo_path: string | null; origin_country: string }>;
        }>(tmdb, endpoint, { query: input.query });
        return data.results.map((n) => ({
          id: n.id, name: n.name, logoPath: n.logo_path, originCountry: n.origin_country,
        }));
      });
    }),

  spotlight: protectedProcedure.query(async ({ ctx }) => {
    const tmdb = await getTmdbProvider();
    return getSpotlight(ctx.db, ctx.session.user.id, tmdb, (type) =>
      tmdb.getTrending(type, { page: 1 }),
    );
  }),

  genres: publicProcedure
    .input(genresInput.optional())
    .query(async ({ input }) => {
      const type = input?.type ?? "movie";
      const provider = await getTmdbProvider();
      return provider.getGenres(type);
    }),

  genreTiles: protectedProcedure
    .input(z.object({ region: z.string().length(2).optional() }).optional())
    .query(async ({ ctx, input }) => {
      let region = input?.region;
      let language: string | undefined;
      if (!region || !language) {
        const row = await ctx.db.query.user.findFirst({
          where: eq(user.id, ctx.session.user.id),
          columns: { language: true, watchRegion: true },
        });
        if (!region) region = row?.watchRegion ?? "US";
        language = row?.language ?? "en-US";
      }

      return cached(`genre-tiles:${region}:${language}`, 24 * 3600, async () => {
        const tmdb = await getTmdbProvider();
        const results = await Promise.all(
          GENRE_TILE_LIST.map(async (g) => {
            try {
              const disc = await tmdb.discover("movie", {
                genreIds: String(g.movieId),
                sort_by: "popularity.desc",
                watchRegion: region,
                page: 1,
              });
              const withBackdrop = disc.results.find((r) => r.backdropPath);
              return {
                id: g.movieId,
                name: g.name,
                color: g.color,
                backdropPath: withBackdrop?.backdropPath ?? null,
              };
            } catch {
              return { id: g.movieId, name: g.name, color: g.color, backdropPath: null };
            }
          }),
        );
        return results;
      });
    }),

  top10: protectedProcedure
    .input(z.object({ region: z.string().length(2).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.user.findFirst({
        where: eq(user.id, ctx.session.user.id),
        columns: { language: true, watchRegion: true },
      });
      const language = row?.language ?? "en-US";
      const region = input?.region ?? row?.watchRegion ?? "US";

      return cached(`top10:${region}:${language}`, 30 * 60, async () => {
        const tmdb = await getTmdbProvider();
        const [movies, shows] = await Promise.all([
          tmdb.getTrending("movie", { timeWindow: "day", language, page: 1 }),
          tmdb.getTrending("show", { timeWindow: "day", language, page: 1 }),
        ]);
        return {
          region,
          movies: movies.results.slice(0, 10),
          shows: shows.results.slice(0, 10),
        };
      });
    }),

  userWatchProviders: protectedProcedure
    .input(z.object({ region: z.string().length(2).optional() }).optional())
    .query(async ({ ctx, input }) => {
      let region = input?.region;
      if (!region) {
        const row = await ctx.db.query.user.findFirst({
          where: eq(user.id, ctx.session.user.id),
          columns: { watchRegion: true },
        });
        region = row?.watchRegion ?? "US";
      }

      return cached(`user-watch-providers:${region}`, 86400, async () => {
        const tmdb = await getTmdbProvider();
        const [movieRes, tvRes] = await Promise.all([
          fetchFromTmdb<{
            results: Array<{
              provider_id: number; provider_name: string; logo_path: string;
              display_priority: number;
            }>;
          }>(tmdb, "/watch/providers/movie", { watch_region: region }),
          fetchFromTmdb<{
            results: Array<{
              provider_id: number; provider_name: string; logo_path: string;
              display_priority: number;
            }>;
          }>(tmdb, "/watch/providers/tv", { watch_region: region }),
        ]);

        const byId = new Map<number, { providerId: number; providerName: string; logoPath: string; displayPriority: number }>();
        for (const p of [...movieRes.results, ...tvRes.results]) {
          const prev = byId.get(p.provider_id);
          const priority = p.display_priority;
          if (!prev || priority < prev.displayPriority) {
            byId.set(p.provider_id, {
              providerId: p.provider_id,
              providerName: p.provider_name,
              logoPath: p.logo_path,
              displayPriority: priority,
            });
          }
        }

        const sorted = Array.from(byId.values())
          .sort((a, b) => a.displayPriority - b.displayPriority);

        const enriched = await Promise.all(
          sorted.map(async (p) => {
            const brandLogoPath = await getBrandLogoPath(tmdb, p.providerName);
            return { ...p, brandLogoPath };
          }),
        );

        return { region, providers: enriched };
      });
    }),

  watchProviderLinks: publicProcedure.query(async ({ ctx }) => {
    const rows = await findWatchProviderLinks(ctx.db);
    const mapping: Record<number, string> = {};
    for (const row of rows) {
      mapping[row.providerId] = row.searchUrlTemplate!;
    }
    return mapping;
  }),
});

/* -------------------------------------------------------------------------- */
/*  Genre tiles — curated list with colors for the discover rail              */
/* -------------------------------------------------------------------------- */

const GENRE_TILE_LIST: ReadonlyArray<{ name: string; movieId: number; color: string }> = [
  { name: "Action",        movieId: 28,    color: "#7c3aed" },
  { name: "Adventure",     movieId: 12,    color: "#16a34a" },
  { name: "Animation",     movieId: 16,    color: "#0ea5e9" },
  { name: "Comedy",        movieId: 35,    color: "#ca8a04" },
  { name: "Crime",         movieId: 80,    color: "#1d4ed8" },
  { name: "Documentary",   movieId: 99,    color: "#0f766e" },
  { name: "Drama",         movieId: 18,    color: "#be123c" },
  { name: "Fantasy",       movieId: 14,    color: "#9333ea" },
  { name: "Horror",        movieId: 27,    color: "#1f2937" },
  { name: "Mystery",       movieId: 9648,  color: "#4338ca" },
  { name: "Romance",       movieId: 10749, color: "#db2777" },
  { name: "Sci-Fi",        movieId: 878,   color: "#6d28d9" },
  { name: "Thriller",      movieId: 53,    color: "#b45309" },
];

/* -------------------------------------------------------------------------- */
/*  Brand logo resolver — maps watch-provider names → TMDB network logo_path   */
/*  (networks have clean wordmark logos; watch-provider logos are often icons) */
/* -------------------------------------------------------------------------- */

const NETWORK_ID_BY_PROVIDER_NAME: Record<string, number> = {
  "netflix": 213,
  "netflix kids": 213,
  "amazon prime video": 1024,
  "amazon video": 1024,
  "prime video": 1024,
  "apple tv": 2552,
  "apple tv+": 2552,
  "apple tv plus": 2552,
  "disney plus": 2739,
  "disney+": 2739,
  "hbo": 49,
  "hbo max": 3186,
  "max": 3186,
  "max amazon channel": 3186,
  "hulu": 453,
  "paramount+": 4330,
  "paramount plus": 4330,
  "paramount+ amazon channel": 4330,
  "peacock": 3353,
  "peacock premium": 3353,
  "starz": 318,
  "starz play": 318,
  "amc+": 174,
  "amc+ amazon channel": 174,
  "showtime": 67,
  "crunchyroll": 1968,
  "globoplay": 4415,
  "discovery+": 4353,
  "discovery plus": 4353,
};

async function getBrandLogoPath(
  tmdb: unknown,
  providerName: string,
): Promise<string | null> {
  const networkId = NETWORK_ID_BY_PROVIDER_NAME[providerName.toLowerCase()];
  if (!networkId) return null;
  return cached(`network-logo:${networkId}`, 30 * 86400, async () => {
    try {
      const data = await fetchFromTmdb<{ logo_path: string | null }>(
        tmdb,
        `/network/${networkId}`,
      );
      return data.logo_path ?? null;
    } catch {
      return null;
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  TMDB raw fetch helper (needed for endpoints not covered by provider port)  */
/* -------------------------------------------------------------------------- */

import { getSetting } from "@canto/db/settings";

async function fetchFromTmdb<T>(
  _tmdb: unknown,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const apiKey = (await getSetting("tmdb.apiKey")) ?? "";
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TMDB API error: ${response.status} ${response.statusText} — ${path} — ${body}`);
  }
  return response.json() as Promise<T>;
}
