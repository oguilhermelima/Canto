import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  logWatchedInput,
  mediaIdInput,
  removeHistoryEntriesInput,
} from "@canto/validators";
import { makeUserMediaRepository } from "@canto/core/infra/user-media/user-media-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makeMediaServerPush } from "@canto/core/infra/media-servers/media-server-push.adapter";
import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";
import { logWatched } from "@canto/core/domain/user-media/use-cases/log-watched";
import { markDropped } from "@canto/core/domain/user-media/use-cases/mark-dropped";
import { removeHistoryEntries } from "@canto/core/domain/user-media/use-cases/remove-history-entries";

export const historyRouter = createTRPCRouter({
  logWatched: protectedProcedure
    .input(logWatchedInput)
    .mutation(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      const mediaRepo = makeMediaRepository(ctx.db);
      const logger = makeConsoleLogger();
      const push = makeMediaServerPush(ctx.db);
      return logWatched({ repo, mediaRepo, logger, push }, ctx.session.user.id, input);
    }),

  getHistory: protectedProcedure
    .input(mediaIdInput)
    .query(async ({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      const history = await repo.findHistoryByMedia(
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
    .mutation(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      const mediaRepo = makeMediaRepository(ctx.db);
      const logger = makeConsoleLogger();
      const push = makeMediaServerPush(ctx.db);
      return removeHistoryEntries(
        { repo, mediaRepo, logger, push },
        ctx.session.user.id,
        input,
      );
    }),

  markDropped: protectedProcedure
    .input(mediaIdInput)
    .mutation(({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      const logger = makeConsoleLogger();
      const push = makeMediaServerPush(ctx.db);
      return markDropped({ repo, logger, push }, ctx.session.user.id, input.mediaId);
    }),
});
