import { regionInput } from "@canto/validators";

import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getSpotlight } from "@canto/core/domain/recommendations/use-cases/get-spotlight";
import { getGenreTiles } from "@canto/core/domain/recommendations/use-cases/get-genre-tiles";
import { getTop10 } from "@canto/core/domain/recommendations/use-cases/get-top-10";
import { buildCoreDeps } from "@canto/core/composition/core-deps";

export const providerDiscoveryRouter = createTRPCRouter({
  spotlight: protectedProcedure.query(async ({ ctx }) => {
    const tmdb = await getTmdbProvider();
    const core = buildCoreDeps(ctx.db);
    return getSpotlight(
      {
        media: core.media,
        lists: core.lists,
        userMedia: core.userMedia,
        recs: core.recommendations,
        extras: core.extras,
        localization: core.localization,
      },
      ctx.session.user.id,
      ctx.session.user.language,
      tmdb,
      (type) => tmdb.getTrending(type, { page: 1 }),
    );
  }),

  genreTiles: protectedProcedure
    .input(regionInput)
    .query(async ({ ctx, input }) => {
      const tmdb = await getTmdbProvider();
      const core = buildCoreDeps(ctx.db);
      return getGenreTiles(
        { cache: core.cache, tmdb },
        ctx.db,
        ctx.session.user.id,
        input?.region,
      );
    }),

  top10: protectedProcedure
    .input(regionInput)
    .query(async ({ ctx, input }) => {
      const tmdb = await getTmdbProvider();
      const core = buildCoreDeps(ctx.db);
      return getTop10(
        { cache: core.cache, tmdb },
        ctx.db,
        ctx.session.user.id,
        input?.region,
      );
    }),
});
