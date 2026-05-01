import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import {
  filterOptionsInput,
  filterSearchInput,
  genresInput,
} from "@canto/validators";
import { tmdbCertification } from "@canto/db/schema";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { makeCache } from "@canto/core/platform/cache/cache.adapter";
import { makeRecommendationsCatalog } from "@canto/core/platform/http/recommendations-catalog.adapter";
import { makeMediaExtrasRepository } from "@canto/core/infra/content-enrichment/media-extras-repository.adapter";
import { getFilterOptions } from "@canto/core/domain/recommendations/use-cases/get-filter-options";
import { searchFilterEntities } from "@canto/core/domain/recommendations/use-cases/search-filter-entities";
import { getUserWatchProviders } from "@canto/core/domain/recommendations/use-cases/get-user-watch-providers";
import { syncTmdbCertifications } from "@canto/core/domain/content-enrichment/use-cases/sync-tmdb-certifications";

const regionInput = z.object({ region: z.string().length(2).optional() }).optional();

export const providerFiltersRouter = createTRPCRouter({
  filterOptions: publicProcedure
    .input(filterOptionsInput)
    .query(({ input }) =>
      getFilterOptions(
        { cache: makeCache(), catalog: makeRecommendationsCatalog() },
        input,
      ),
    ),

  filterSearch: publicProcedure
    .input(filterSearchInput)
    .query(({ input }) =>
      searchFilterEntities(
        { cache: makeCache(), catalog: makeRecommendationsCatalog() },
        input,
      ),
    ),

  genres: publicProcedure
    .input(genresInput.optional())
    .query(async ({ input }) => {
      const provider = await getTmdbProvider();
      return provider.getGenres(input?.type ?? "movie");
    }),

  userWatchProviders: protectedProcedure
    .input(regionInput)
    .query(({ ctx, input }) =>
      getUserWatchProviders(
        { cache: makeCache(), catalog: makeRecommendationsCatalog() },
        ctx.db,
        ctx.session.user.id,
        input?.region,
      ),
    ),

  watchProviderLinks: publicProcedure.query(async ({ ctx }) => {
    const rows = await makeMediaExtrasRepository(ctx.db).findWatchProviderLinks();
    const mapping: Record<number, string> = {};
    for (const row of rows) {
      if (row.searchUrlTemplate) mapping[row.providerId] = row.searchUrlTemplate;
    }
    return mapping;
  }),

  /**
   * Region-keyed certification options from the TMDB catalog. Lazily seeds
   * the cache on first call so we don't need a startup hook.
   */
  certifications: publicProcedure
    .input(z.object({ type: z.enum(["movie", "tv"]) }))
    .query(async ({ ctx, input }) => {
      let rows = await ctx.db
        .select({
          region: tmdbCertification.region,
          rating: tmdbCertification.rating,
          meaning: tmdbCertification.meaning,
          sortOrder: tmdbCertification.sortOrder,
        })
        .from(tmdbCertification)
        .where(eq(tmdbCertification.type, input.type))
        .orderBy(asc(tmdbCertification.region), asc(tmdbCertification.sortOrder));

      if (rows.length === 0) {
        const tmdb = await getTmdbProvider();
        await syncTmdbCertifications(ctx.db, tmdb);
        rows = await ctx.db
          .select({
            region: tmdbCertification.region,
            rating: tmdbCertification.rating,
            meaning: tmdbCertification.meaning,
            sortOrder: tmdbCertification.sortOrder,
          })
          .from(tmdbCertification)
          .where(eq(tmdbCertification.type, input.type))
          .orderBy(asc(tmdbCertification.region), asc(tmdbCertification.sortOrder));
      }

      const grouped: Record<string, Array<{ value: string; label: string; meaning: string | null }>> = {};
      for (const row of rows) {
        if (!grouped[row.region]) grouped[row.region] = [];
        grouped[row.region]!.push({
          value: row.rating,
          label: row.rating,
          meaning: row.meaning,
        });
      }
      return grouped;
    }),
});
