import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  findUserProfileInsights,
  findUserRatingDistribution,
  findUserRecentActivity,
  findUserTopGenres,
} from "@canto/core/infra/user-media/profile-insights-repository";
import { findUserWatchTimeStats } from "@canto/core/infra/user-media/stats-repository";

export const analyticsRouter = createTRPCRouter({
  getRatingDistribution: protectedProcedure.query(({ ctx }) =>
    findUserRatingDistribution(ctx.db, ctx.session.user.id),
  ),

  getTopGenres: protectedProcedure.query(({ ctx }) =>
    findUserTopGenres(ctx.db, ctx.session.user.id),
  ),

  getWatchTimeStats: protectedProcedure.query(({ ctx }) =>
    findUserWatchTimeStats(ctx.db, ctx.session.user.id, ctx.session.user.language),
  ),

  getRecentActivity: protectedProcedure.query(({ ctx }) =>
    findUserRecentActivity(ctx.db, ctx.session.user.id, ctx.session.user.language),
  ),

  getProfileInsights: protectedProcedure.query(({ ctx }) =>
    findUserProfileInsights(ctx.db, ctx.session.user.id, ctx.session.user.language),
  ),
});
