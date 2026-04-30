import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getSpotlight } from "@canto/core/domain/recommendations/use-cases/get-spotlight";
import { getGenreTiles } from "@canto/core/domain/recommendations/use-cases/get-genre-tiles";
import { getTop10 } from "@canto/core/domain/recommendations/use-cases/get-top-10";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makeListsRepository } from "@canto/core/infra/lists/lists-repository.adapter";
import { makeUserMediaRepository } from "@canto/core/infra/user-media/user-media-repository.adapter";
import { makeRecommendationsRepository } from "@canto/core/infra/recommendations/recommendations-repository.adapter";
import { makeMediaExtrasRepository } from "@canto/core/infra/content-enrichment/media-extras-repository.adapter";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";

const regionInput = z.object({ region: z.string().length(2).optional() }).optional();

export const providerDiscoveryRouter = createTRPCRouter({
  spotlight: protectedProcedure.query(async ({ ctx }) => {
    const tmdb = await getTmdbProvider();
    const spotlightDeps = {
      media: makeMediaRepository(ctx.db),
      lists: makeListsRepository(ctx.db),
      userMedia: makeUserMediaRepository(ctx.db),
      recs: makeRecommendationsRepository(ctx.db),
      extras: makeMediaExtrasRepository(ctx.db),
      localization: makeMediaLocalizationRepository(ctx.db),
    };
    return getSpotlight(
      spotlightDeps,
      ctx.session.user.id,
      ctx.session.user.language,
      tmdb,
      (type) => tmdb.getTrending(type, { page: 1 }),
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
