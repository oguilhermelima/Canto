import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  mediaIdInput,
  toggleFavoriteInput,
  trackInput,
  updateMediaStatusInput,
} from "@canto/validators";
import { upsertUserMediaState } from "@canto/core/infrastructure/repositories";
import { getUserMediaState } from "@canto/core/domain/use-cases/user-media/get-user-media-state";
import { clearTracking } from "@canto/core/domain/use-cases/user-media/clear-tracking";
import { reconcileStatesFromPlayback } from "@canto/core/domain/use-cases/user-media/reconcile-states-from-playback";

export const stateRouter = createTRPCRouter({
  getState: protectedProcedure
    .input(mediaIdInput)
    .query(({ ctx, input }) =>
      getUserMediaState(ctx.db, ctx.session.user.id, input.mediaId),
    ),

  updateState: protectedProcedure
    .input(updateMediaStatusInput)
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        ...(input.status !== undefined && { status: input.status }),
        ...(input.rating !== undefined && { rating: input.rating }),
      });
      return { success: true };
    }),

  track: protectedProcedure
    .input(trackInput)
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        status: input.status,
      });
      return { success: true };
    }),

  toggleFavorite: protectedProcedure
    .input(toggleFavoriteInput)
    .mutation(async ({ ctx, input }) => {
      await upsertUserMediaState(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        isFavorite: input.isFavorite,
      });
      return { success: true };
    }),

  clearTracking: protectedProcedure
    .input(mediaIdInput)
    .mutation(({ ctx, input }) =>
      clearTracking(ctx.db, ctx.session.user.id, input.mediaId),
    ),

  reconcileStatesFromPlayback: protectedProcedure.mutation(({ ctx }) =>
    reconcileStatesFromPlayback(ctx.db, ctx.session.user.id),
  ),
});
