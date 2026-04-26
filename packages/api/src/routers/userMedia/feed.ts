import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  getLibraryHistoryInput,
  getLibraryWatchNextInput,
  getUpcomingScheduleInput,
  getUserMediaInput,
} from "@canto/validators";
import {
  findLibraryGenres,
  findTrailerKeysForMediaIds,
  findUserLibraryStats,
  findUserMediaCounts,
  findUserMediaPaginated,
} from "@canto/core/infra/repositories";
import { getLibraryWatchNext } from "@canto/core/domain/user-media/use-cases/get-library-watch-next";
import { getUpcomingSchedule } from "@canto/core/domain/user-media/use-cases/get-upcoming-schedule";
import { getLibraryHistory } from "@canto/core/domain/user-media/use-cases/get-library-history";

export const feedRouter = createTRPCRouter({
  getUserMedia: protectedProcedure
    .input(getUserMediaInput)
    .query(async ({ ctx, input }) => {
      const offset = input.cursor ?? 0;
      const userLang = ctx.session.user.language;
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
      // Trailer keys are no longer joined inline in `mediaI18n` — batch-fetch
      // them once for the page so the UI hover-trailer feature still works
      // without paying for the per-row correlated subquery.
      const trailerByMediaId = await findTrailerKeysForMediaIds(
        ctx.db,
        result.items.map((i) => i.mediaId),
      );
      const items = result.items.map((item) => ({
        ...item,
        trailerKey: trailerByMediaId.get(item.mediaId) ?? null,
      }));
      const nextCursor =
        offset + input.limit < result.total ? offset + input.limit : undefined;
      return { items, total: result.total, nextCursor };
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
