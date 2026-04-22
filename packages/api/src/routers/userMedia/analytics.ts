import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  findUserProfileInsights,
  findUserRatingDistribution,
  findUserRecentActivity,
  findUserTopGenres,
  findUserWatchTimeStats,
} from "@canto/core/infra/repositories";

export const analyticsRouter = createTRPCRouter({
  getRatingDistribution: protectedProcedure.query(({ ctx }) =>
    findUserRatingDistribution(ctx.db, ctx.session.user.id),
  ),

  getTopGenres: protectedProcedure.query(({ ctx }) =>
    findUserTopGenres(ctx.db, ctx.session.user.id),
  ),

  getWatchTimeStats: protectedProcedure.query(({ ctx }) =>
    findUserWatchTimeStats(ctx.db, ctx.session.user.id),
  ),

  getRecentActivity: protectedProcedure.query(({ ctx }) =>
    findUserRecentActivity(ctx.db, ctx.session.user.id),
  ),

  getProfileInsights: protectedProcedure.query(({ ctx }) =>
    findUserProfileInsights(ctx.db, ctx.session.user.id),
  ),
});
