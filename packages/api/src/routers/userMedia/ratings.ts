import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  getEpisodeReviewsInput,
  getMediaReviewsInput,
  getReviewByIdInput,
  mediaIdInput,
  rateInput,
  removeRatingInput,
} from "@canto/validators";
import { makeUserMediaRepository } from "@canto/core/infra/user-media/user-media-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { rateMedia } from "@canto/core/domain/user-media/use-cases/rate-media";
import { removeRating } from "@canto/core/domain/user-media/use-cases/remove-rating";

export const ratingsRouter = createTRPCRouter({
  rate: protectedProcedure
    .input(rateInput)
    .mutation(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      return rateMedia({ repo }, ctx.session.user.id, input);
    }),

  removeRating: protectedProcedure
    .input(removeRatingInput)
    .mutation(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      const mediaRepo = makeMediaRepository(ctx.db);
      return removeRating({ repo, mediaRepo }, ctx.session.user.id, input);
    }),

  getRatings: protectedProcedure
    .input(mediaIdInput)
    .query(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      return repo.findRatingsByMedia(ctx.session.user.id, input.mediaId);
    }),

  getMediaReviews: protectedProcedure
    .input(getMediaReviewsInput)
    .query(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      return repo.findMediaReviews(input.mediaId, input);
    }),

  getReviewById: protectedProcedure
    .input(getReviewByIdInput)
    .query(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      return repo.findReviewById(input.reviewId);
    }),

  getEpisodeReviews: protectedProcedure
    .input(getEpisodeReviewsInput)
    .query(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      return repo.findEpisodeRatingsFromAllUsers(input.episodeId);
    }),
});
