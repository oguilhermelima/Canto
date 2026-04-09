import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  findUserMediaState,
  upsertUserMediaState,
  findUserPlaybackProgress,
} from "@canto/core/infrastructure/repositories";

export const userMediaRouter = createTRPCRouter({
  getState: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const [state, progress] = await Promise.all([
        findUserMediaState(ctx.db, ctx.session.user.id, input.mediaId),
        findUserPlaybackProgress(ctx.db, ctx.session.user.id, input.mediaId),
      ]);

      return {
        mediaId: input.mediaId,
        trackingStatus: state?.status ?? "none",
        rating: state?.rating ?? null,
        progress: progress?.positionSeconds ?? 0,
        isCompleted: progress?.isCompleted ?? false,
        lastWatchedAt: progress?.lastWatchedAt ?? null,
        source: progress?.source ?? null,
      };
    }),

  updateState: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
      trackingStatus: z.enum(["none", "planned", "watching", "completed", "dropped"]).optional(),
      rating: z.number().min(0).max(10).optional(),
      progress: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        ...(input.trackingStatus !== undefined && { status: input.trackingStatus }),
        ...(input.rating !== undefined && { rating: input.rating }),
      });
      return { success: true };
    }),

  rate: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
      rating: z.number().min(0).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        rating: input.rating,
      });
      return { success: true };
    }),

  track: protectedProcedure
    .input(z.object({
      mediaId: z.string(),
      status: z.enum(["none", "planned", "watching", "completed", "dropped"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        status: input.status,
      });
      return { success: true };
    }),
});
