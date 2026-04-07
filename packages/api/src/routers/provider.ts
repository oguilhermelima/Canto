import {
  filterOptionsInput,
  filterSearchInput,
  genresInput,
} from "@canto/validators";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import { cached } from "@canto/core/infrastructure/cache/redis";
import { findWatchProviderLinks } from "@canto/core/infrastructure/repositories/extras-repository";

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
          const extras = await tmdb.getExtras(0, "movie");
          // Regions come from the watchProviders field — use direct TMDB call for now
          // TODO: This should be a dedicated provider method
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
/*  TMDB raw fetch helper (needed for endpoints not covered by provider port)  */
/* -------------------------------------------------------------------------- */

import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "@canto/core/lib/settings-keys";

async function fetchFromTmdb<T>(
  _tmdb: unknown,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const apiKey = (await getSetting(SETTINGS.TMDB_API_KEY)) ?? "";
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
