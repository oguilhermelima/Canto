import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  mediaIdInput,
  toggleFavoriteInput,
  trackInput,
  updateMediaStatusInput,
} from "@canto/validators";
import { makeUserMediaRepository } from "@canto/core/infra/user-media/user-media-repository.adapter";
import { getUserMediaState } from "@canto/core/domain/user-media/use-cases/get-user-media-state";
import { clearTracking } from "@canto/core/domain/user-media/use-cases/clear-tracking";
import { reconcileStatesFromPlayback } from "@canto/core/domain/user-media/use-cases/reconcile-states-from-playback";

export const stateRouter = createTRPCRouter({
  getState: protectedProcedure
    .input(mediaIdInput)
    .query(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      return getUserMediaState({ repo }, ctx.session.user.id, input.mediaId);
    }),

  updateState: protectedProcedure
    .input(updateMediaStatusInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      await repo.upsertState({
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
      const repo = makeUserMediaRepository(ctx.db);
      await repo.upsertState({
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        status: input.status,
      });
      return { success: true };
    }),

  toggleFavorite: protectedProcedure
    .input(toggleFavoriteInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      await repo.upsertState({
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        isFavorite: input.isFavorite,
      });
      return { success: true };
    }),

  clearTracking: protectedProcedure
    .input(mediaIdInput)
    .mutation(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      return clearTracking(ctx.db, { repo }, ctx.session.user.id, input.mediaId);
    }),

  reconcileStatesFromPlayback: protectedProcedure.mutation(({ ctx }) => {
    const repo = makeUserMediaRepository(ctx.db);
    return reconcileStatesFromPlayback(ctx.db, { repo }, ctx.session.user.id);
  }),
});
