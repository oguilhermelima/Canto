import type { SearchResult } from "@canto/providers";
import { getDefaultLanguage } from "@canto/db/settings";
import { eq } from "drizzle-orm";
import { user } from "@canto/db/schema";
import { TRPCError } from "@trpc/server";
import {
  browseMediaInput,
  getPersonInput,
  recommendationsInput,
  getLogoInput,
} from "@canto/validators";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getTvdbProvider } from "@canto/core/platform/http/tvdb-client";
import { cached } from "@canto/core/platform/cache/redis";
import { fetchLogos, enrichBrowseWithLogos } from "@canto/core/domain/media/use-cases/fetch-logos";
import { getRecommendations } from "@canto/core/domain/recommendations/use-cases/get-recommendations";
import type { RecsFilters } from "@canto/core/infra/recommendations/user-recommendation-repository";
import { db as appDb } from "@canto/db/client";

async function getProviderWithKey(name: "tmdb" | "tvdb") {
  if (name === "tmdb") return getTmdbProvider();
  return getTvdbProvider();
}

export const mediaDiscoveryRouter = createTRPCRouter({
  browse: publicProcedure
    .input(browseMediaInput)
    .query(async ({ input }) => {
      const page = input.cursor ?? input.page;
      // 60s in-process TTL — browse is hit on every public page load (logged-in
      // and anonymous) so the global setting read used to dominate p50.
      const browseSettingsLang = await getDefaultLanguage();

      if (input.mode === "search") {
        if (!input.query) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Query is required for search mode" });
        }

        const searchLang = browseSettingsLang;
        const searchResults = await cached(
          `browse:search:${input.provider}:${input.type}:${input.query}:${page}:${searchLang}`,
          1800,
          async () => {
            const provider = await getProviderWithKey(input.provider);
            return provider.search(input.query!, input.type, { page });
          },
        );

        // Post-filter search results by genre/language/score (TMDB search API doesn't support these)
        const genreSet = input.genres
          ? new Set(input.genres.split(/[|,]/).map(Number).filter(Boolean))
          : null;
        const genreMode = input.genres?.includes(",") ? "and" : "or";

        const hasPostFilters = genreSet || input.language || input.scoreMin != null || input.scoreMax != null || input.dateFrom || input.dateTo;
        if (hasPostFilters) {
          const filtered = searchResults.results.filter((r) => {
            if (genreSet && r.genreIds) {
              if (genreMode === "and") {
                if (!([...genreSet].every((g) => r.genreIds!.includes(g)))) return false;
              } else {
                if (!r.genreIds.some((g) => genreSet.has(g))) return false;
              }
            } else if (genreSet && !r.genreIds) {
              return false;
            }
            if (input.language && r.originalLanguage !== input.language) return false;
            if (input.scoreMin != null && (r.voteAverage ?? 0) < input.scoreMin) return false;
            if (input.scoreMax != null && (r.voteAverage ?? 0) > input.scoreMax) return false;
            if (input.dateFrom && r.releaseDate && r.releaseDate < input.dateFrom) return false;
            if (input.dateTo && r.releaseDate && r.releaseDate > input.dateTo) return false;
            return true;
          });
          return enrichBrowseWithLogos(appDb, {
            ...searchResults,
            results: filtered,
            totalResults: filtered.length,
          }, browseSettingsLang);
        }

        return enrichBrowseWithLogos(appDb, searchResults, browseSettingsLang);
      }

      const cacheKey = `browse:${input.type}:${input.mode}:${input.query ?? ""}:${input.genres ?? ""}:${input.language ?? ""}:${input.sortBy ?? ""}:${input.dateFrom ?? ""}:${input.dateTo ?? ""}:${input.keywords ?? ""}:${input.scoreMin ?? ""}:${input.scoreMax ?? ""}:${input.runtimeMax ?? ""}:${input.certification ?? ""}:${input.status ?? ""}:${input.watchProviders ?? ""}:${input.watchRegion ?? ""}:${input.runtimeMin ?? ""}:${page}:${browseSettingsLang}`;

      const browseResults = await cached(cacheKey, 1800, async () => {
        const provider = await getTmdbProvider();
        const today = new Date().toISOString().slice(0, 10);

        const filterReleased = <T extends { results: SearchResult[] }>(data: T): T => ({
          ...data,
          results: data.results.filter((r) => !r.releaseDate || r.releaseDate <= today),
        });

        const discoverOpts = {
          page,
          query: input.query,
          genreIds: input.genres,
          originalLanguage: input.language,
          keywordIds: input.keywords,
          minScore: input.scoreMin,
          maxScore: input.scoreMax,
          minRuntime: input.runtimeMin,
          maxRuntime: input.runtimeMax,
          sort_by: input.sortBy ?? "popularity.desc",
          firstAirDateFrom: input.type === "show" ? input.dateFrom : undefined,
          releaseDateFrom: input.type === "movie" ? input.dateFrom : undefined,
          firstAirDateTo: input.type === "show" ? (input.dateTo ?? today) : undefined,
          releaseDateTo: input.type === "movie" ? (input.dateTo ?? today) : undefined,
          certification: input.certification,
          certification_country: input.certification
            ? (input.watchRegion ?? "US")
            : undefined,
          with_status: input.status,
          watchProviderIds: input.watchProviders,
          watchRegion: input.watchRegion,
        };

        if (input.mode === "trending") {
          const hasFilters = input.genres || input.language || input.keywords || input.scoreMin != null || input.scoreMax != null || input.runtimeMax != null || input.certification || input.status || input.watchProviders || input.runtimeMin != null;
          if (hasFilters) {
            return filterReleased(await provider.discover(input.type, discoverOpts));
          }
          return filterReleased(await provider.getTrending(input.type, { page }));
        }

        return filterReleased(await provider.discover(input.type, discoverOpts));
      });
      return enrichBrowseWithLogos(appDb, browseResults, browseSettingsLang);
    }),

  getPerson: publicProcedure
    .input(getPersonInput)
    .query(({ input }) =>
      cached(`person:${input.personId}`, 86400, async () => {
        const provider = await getTmdbProvider();
        return provider.getPerson(input.personId);
      }),
    ),

  getLogo: protectedProcedure
    .input(getLogoInput)
    .query(async ({ ctx, input }) => {
      const tmdb = await getTmdbProvider();
      const userLang = ctx.session.user.language;
      const result = await fetchLogos(ctx.db, tmdb, [input], userLang);
      const key = `${input.provider}-${input.type}-${input.externalId}`;
      return { logoPath: result[key] ?? null };
    }),

  recommendations: protectedProcedure
    .input(recommendationsInput.optional())
    .query(async ({ ctx, input }) => {
      const page = input?.cursor ?? 0;
      const pageSize = input?.pageSize ?? 10;
      const userId = ctx.session.user.id;

      const recsFilters: RecsFilters = {
        genreIds: input?.genreIds,
        genreMode: input?.genreMode ?? "or",
        language: input?.language,
        scoreMin: input?.scoreMin,
        scoreMax: input?.scoreMax,
        yearMin: input?.yearMin,
        yearMax: input?.yearMax,
        runtimeMin: input?.runtimeMin,
        runtimeMax: input?.runtimeMax,
        certification: input?.certification,
        status: input?.status,
        sortBy: input?.sortBy,
        watchProviders: input?.watchProviders,
        watchRegion: input?.watchRegion,
      };

      // Only fetch recsVersion now — language comes off the session, so we
      // skip the round trip when we already have it on `ctx.session.user`.
      const userRow = await ctx.db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: { recsVersion: true },
      });

      const tmdb = await getTmdbProvider();
      return getRecommendations(ctx.db, {
        userId, page, pageSize, filters: recsFilters,
        userLang: ctx.session.user.language,
        recsVersion: userRow?.recsVersion ?? 0,
      }, tmdb);
    }),

  /**
   * Light polling endpoint: returns just the rec version + last-updated
   * timestamp from the `user` row. Lets the client cheaply detect when the
   * heavy `recommendations` query needs to be invalidated, without paying
   * for the full denormalized read each tick.
   */
  recommendationsVersion: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.user.findFirst({
      where: eq(user.id, ctx.session.user.id),
      columns: { recsVersion: true, recsUpdatedAt: true },
    });
    return {
      recsVersion: row?.recsVersion ?? 0,
      recsUpdatedAt: row?.recsUpdatedAt ?? null,
    };
  }),
});
