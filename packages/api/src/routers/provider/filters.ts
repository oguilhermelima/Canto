import { z } from "zod";
import {
  filterOptionsInput,
  filterSearchInput,
  genresInput,
} from "@canto/validators";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import { findWatchProviderLinks } from "@canto/core/infrastructure/repositories/extras-repository";
import { getFilterOptions } from "@canto/core/domain/use-cases/recommendations/get-filter-options";
import { searchFilterEntities } from "@canto/core/domain/use-cases/recommendations/search-filter-entities";
import { getUserWatchProviders } from "@canto/core/domain/use-cases/recommendations/get-user-watch-providers";

const regionInput = z.object({ region: z.string().length(2).optional() }).optional();

export const providerFiltersRouter = createTRPCRouter({
  filterOptions: publicProcedure
    .input(filterOptionsInput)
    .query(({ input }) => getFilterOptions(input)),

  filterSearch: publicProcedure
    .input(filterSearchInput)
    .query(({ input }) => searchFilterEntities(input)),

  genres: publicProcedure
    .input(genresInput.optional())
    .query(async ({ input }) => {
      const provider = await getTmdbProvider();
      return provider.getGenres(input?.type ?? "movie");
    }),

  userWatchProviders: protectedProcedure
    .input(regionInput)
    .query(({ ctx, input }) =>
      getUserWatchProviders(ctx.db, ctx.session.user.id, input?.region),
    ),

  watchProviderLinks: publicProcedure.query(async ({ ctx }) => {
    const rows = await findWatchProviderLinks(ctx.db);
    const mapping: Record<number, string> = {};
    for (const row of rows) {
      mapping[row.providerId] = row.searchUrlTemplate!;
    }
    return mapping;
  }),
});
