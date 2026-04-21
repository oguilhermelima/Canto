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
import { findWatchProviderLinks } from "@canto/core/infrastructure/repositories/content-enrichment/extras";
import { user } from "@canto/db/schema";

// ── Extracted use-case ──
import { getSpotlight } from "@canto/core/domain/use-cases/recommendations/get-spotlight";

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

      // v2: response shape changed from single providerId to a grouped
      // providerIds[] per canonical brand. Bumping the version invalidates
      // cached v1 payloads that would otherwise break the client.
      return cached(`user-watch-providers:v2:${region}`, 86400, async () => {
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

        type RawProvider = { providerId: number; providerName: string; logoPath: string; displayPriority: number };
        const byId = new Map<number, RawProvider>();
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

        // Group brand variants ("Apple TV", "Apple TV+", "Apple TV Channel",
        // "Max Amazon Channel"…) into one tile. Keep every underlying
        // provider id so the search filter can match all of them at once —
        // clicking the Apple TV tile should surface everything the user can
        // watch across subscription + rent/buy + channels, not just one
        // storefront.
        const byBrand = new Map<string, { flagship: RawProvider; ids: Set<number> }>();
        for (const p of byId.values()) {
          const key = canonicalBrand(p.providerName);
          const existing = byBrand.get(key);
          if (!existing) {
            byBrand.set(key, { flagship: p, ids: new Set([p.providerId]) });
          } else {
            existing.ids.add(p.providerId);
            if (p.displayPriority < existing.flagship.displayPriority) {
              existing.flagship = p;
            }
          }
        }

        const sorted = Array.from(byBrand.values())
          .sort((a, b) => a.flagship.displayPriority - b.flagship.displayPriority)
          .map(({ flagship, ids }) => ({
            providerId: flagship.providerId,
            providerIds: Array.from(ids).sort((a, b) => a - b),
            providerName: flagship.providerName,
            logoPath: flagship.logoPath,
            displayPriority: flagship.displayPriority,
          }));

        return { region, providers: sorted };
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
/*  Brand canonicalization — collapses TMDB's storefront variants               */
/*  ("Apple TV+", "Apple TV Store", "Max Amazon Channel") onto a single key.   */
/* -------------------------------------------------------------------------- */

// Explicit aliases for brands TMDB splits into multiple provider ids that
// don't share an obvious textual pattern. Matched case-insensitively; if a
// name matches one of these substrings, the mapped canonical key is used
// instead of the regex-based normalization below.
const BRAND_ALIASES: ReadonlyArray<[RegExp, string]> = [
  [/^apple\s*tv(\s|$|[+])/i, "apple tv"],
  [/^amazon(\s+prime)?\s*(video)?(\s|$)/i, "amazon prime video"],
  [/^prime\s*video(\s|$)/i, "amazon prime video"],
  [/^(hbo\s*)?max(\s|$)/i, "max"],
  [/^hbo(\s|$)/i, "max"],
  [/^disney(\s*\+|\s*plus)(\s|$)/i, "disney+"],
  [/^paramount(\s*\+|\s*plus)(\s|$)/i, "paramount+"],
  [/^peacock(\s|$)/i, "peacock"],
  [/^discovery(\s*\+|\s*plus)(\s|$)/i, "discovery+"],
  [/^amc\+?(\s|$)/i, "amc+"],
  [/^starz(\s|$)/i, "starz"],
  [/^netflix(\s|$)/i, "netflix"],
  [/^google\s+play(\s|$)/i, "google play"],
];

function canonicalBrand(name: string): string {
  const trimmed = name.trim();
  for (const [pattern, canonical] of BRAND_ALIASES) {
    if (pattern.test(trimmed)) return canonical;
  }
  return trimmed
    .toLowerCase()
    .replace(/\s+amazon\s+channel\b/g, "")
    .replace(/\s+apple\s+tv\s+channel\b/g, "")
    .replace(/\s+\((?:ads|with\s+ads)\)\s*$/g, "")
    .replace(/\s+store\b/g, "")
    .replace(/\s+plus\b/g, "+")
    .replace(/\+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
