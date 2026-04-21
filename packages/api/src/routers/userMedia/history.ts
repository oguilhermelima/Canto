import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  logWatchedInput,
  mediaIdInput,
  removeHistoryEntriesInput,
} from "@canto/validators";
import { findUserWatchHistoryByMedia } from "@canto/core/infrastructure/repositories";
import { logWatched } from "@canto/core/domain/use-cases/user-media/log-watched";
import { removeHistoryEntries } from "@canto/core/domain/use-cases/user-media/remove-history-entries";

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
});
