import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  logWatchedInput,
  mediaIdInput,
  removeHistoryEntriesInput,
} from "@canto/validators";
import { findUserWatchHistoryByMedia } from "@canto/core/infra/repositories";
import { logWatched } from "@canto/core/domain/user-media/use-cases/log-watched";
import { markDropped } from "@canto/core/domain/user-media/use-cases/mark-dropped";
import { removeHistoryEntries } from "@canto/core/domain/user-media/use-cases/remove-history-entries";

export const historyRouter = createTRPCRouter({
  logWatched: protectedProcedure
    .input(logWatchedInput)
    .mutation(({ ctx, input }) =>
      logWatched(ctx.db, ctx.session.user.id, input),
    ),

  getHistory: protectedProcedure
    .input(mediaIdInput)
    .query(async ({ ctx, input }) => {
      const history = await findUserWatchHistoryByMedia(
        ctx.db,
        ctx.session.user.id,
        input.mediaId,
      );
      return history.map((event) => ({
        id: event.id,
        episodeId: event.episodeId,
        watchedAt: event.watchedAt,
        source: event.source ?? null,
      }));
    }),

  removeHistoryEntries: protectedProcedure
    .input(removeHistoryEntriesInput)
    .mutation(({ ctx, input }) =>
      removeHistoryEntries(ctx.db, ctx.session.user.id, input),
    ),

  markDropped: protectedProcedure
    .input(mediaIdInput)
    .mutation(({ ctx, input }) =>
      markDropped(ctx.db, ctx.session.user.id, input.mediaId),
    ),
});
