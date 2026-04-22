import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  getLibraryHistoryInput,
  getLibraryWatchNextInput,
  getUpcomingScheduleInput,
  getUserMediaInput,
} from "@canto/validators";
import {
  findLibraryGenres,
  findUserLibraryStats,
  findUserMediaCounts,
  findUserMediaPaginated,
} from "@canto/core/infrastructure/repositories";
import { getUserLanguage } from "@canto/core/domain/shared/services/user-service";
import { getLibraryWatchNext } from "@canto/core/domain/use-cases/user-media/get-library-watch-next";
import { getUpcomingSchedule } from "@canto/core/domain/use-cases/user-media/get-upcoming-schedule";
import { getLibraryHistory } from "@canto/core/domain/use-cases/user-media/get-library-history";

export const feedRouter = createTRPCRouter({
  getUserMedia: protectedProcedure
    .input(getUserMediaInput)
    .query(async ({ ctx, input }) => {
      const offset = input.cursor ?? 0;
      const userLang = await getUserLanguage(ctx.db, ctx.session.user.id);
      const result = await findUserMediaPaginated(ctx.db, ctx.session.user.id, userLang, {
        status: input.status,
        hasRating: input.hasRating,
        isFavorite: input.isFavorite,
        isHidden: input.isHidden,
        mediaType: input.mediaType,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
        limit: input.limit,
        offset,
      });
      const nextCursor =
        offset + input.limit < result.total ? offset + input.limit : undefined;
      return { items: result.items, total: result.total, nextCursor };
    }),

  getUserMediaCounts: protectedProcedure.query(({ ctx }) =>
    findUserMediaCounts(ctx.db, ctx.session.user.id),
  ),

  getLibraryGenres: protectedProcedure.query(({ ctx }) =>
    findLibraryGenres(ctx.db, ctx.session.user.id),
  ),

  getLibraryStats: protectedProcedure.query(({ ctx }) =>
    findUserLibraryStats(ctx.db, ctx.session.user.id),
  ),

  getLibraryWatchNext: protectedProcedure
    .input(getLibraryWatchNextInput)
    .query(({ ctx, input }) =>
      getLibraryWatchNext(ctx.db, ctx.session.user.id, input),
    ),

  getUpcomingSchedule: protectedProcedure
    .input(getUpcomingScheduleInput)
    .query(({ ctx, input }) =>
      getUpcomingSchedule(ctx.db, ctx.session.user.id, input),
    ),

  getLibraryHistory: protectedProcedure
    .input(getLibraryHistoryInput)
    .query(({ ctx, input }) =>
      getLibraryHistory(ctx.db, ctx.session.user.id, input),
    ),
});
