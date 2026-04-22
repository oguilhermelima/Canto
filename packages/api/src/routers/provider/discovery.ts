import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getSpotlight } from "@canto/core/domain/recommendations/use-cases/get-spotlight";
import { getGenreTiles } from "@canto/core/domain/recommendations/use-cases/get-genre-tiles";
import { getTop10 } from "@canto/core/domain/recommendations/use-cases/get-top-10";

const regionInput = z.object({ region: z.string().length(2).optional() }).optional();

export const providerDiscoveryRouter = createTRPCRouter({
  spotlight: protectedProcedure.query(async ({ ctx }) => {
    const tmdb = await getTmdbProvider();
    return getSpotlight(ctx.db, ctx.session.user.id, tmdb, (type) =>
      tmdb.getTrending(type, { page: 1 }),
    );
  }),

  genreTiles: protectedProcedure
    .input(regionInput)
    .query(({ ctx, input }) =>
      getGenreTiles(ctx.db, ctx.session.user.id, input?.region),
    ),

  top10: protectedProcedure
    .input(regionInput)
    .query(({ ctx, input }) =>
      getTop10(ctx.db, ctx.session.user.id, input?.region),
    ),
});
