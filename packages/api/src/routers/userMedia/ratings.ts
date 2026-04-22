import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  getEpisodeReviewsInput,
  getMediaReviewsInput,
  getReviewByIdInput,
  mediaIdInput,
  rateInput,
  removeRatingInput,
} from "@canto/validators";
import {
  findEpisodeRatingsFromAllUsers,
  findMediaReviews,
  findReviewById,
  findUserRatingsByMedia,
} from "@canto/core/infra/repositories";
import { rateMedia } from "@canto/core/domain/use-cases/user-media/rate-media";
import { removeRating } from "@canto/core/domain/use-cases/user-media/remove-rating";

export const ratingsRouter = createTRPCRouter({
  rate: protectedProcedure
    .input(rateInput)
    .mutation(({ ctx, input }) =>
      rateMedia(ctx.db, ctx.session.user.id, input),
    ),

  removeRating: protectedProcedure
    .input(removeRatingInput)
    .mutation(({ ctx, input }) =>
      removeRating(ctx.db, ctx.session.user.id, input),
    ),

  getRatings: protectedProcedure
    .input(mediaIdInput)
    .query(({ ctx, input }) =>
      findUserRatingsByMedia(ctx.db, ctx.session.user.id, input.mediaId),
    ),

  getMediaReviews: protectedProcedure
    .input(getMediaReviewsInput)
    .query(({ ctx, input }) => findMediaReviews(ctx.db, input.mediaId, input)),

  getReviewById: protectedProcedure
    .input(getReviewByIdInput)
    .query(({ ctx, input }) => findReviewById(ctx.db, input.reviewId)),

  getEpisodeReviews: protectedProcedure
    .input(getEpisodeReviewsInput)
    .query(({ ctx, input }) =>
      findEpisodeRatingsFromAllUsers(ctx.db, input.episodeId),
    ),
});
