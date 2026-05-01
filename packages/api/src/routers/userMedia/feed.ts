import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  getContinueWatchingInput,
  getLibraryHistoryInput,
  getLibraryWatchNextInput,
  getUpcomingScheduleInput,
  getUserMediaInput,
  getWatchNextInput,
} from "@canto/validators";
import { findUserLibraryStats } from "@canto/core/infra/user-media/stats-repository";
import { makeUserMediaRepository } from "@canto/core/infra/user-media/user-media-repository.adapter";
import { makeLibraryFeedRepository } from "@canto/core/infra/user-media/library-feed-repository.adapter";
import { makeRecommendationsRepository } from "@canto/core/infra/recommendations/recommendations-repository.adapter";
import { makeMediaExtrasRepository } from "@canto/core/infra/content-enrichment/media-extras-repository.adapter";
import { getContinueWatching } from "@canto/core/domain/user-media/use-cases/get-continue-watching";
import { getLibraryWatchNext } from "@canto/core/domain/user-media/use-cases/get-library-watch-next";
import { getUpcomingSchedule } from "@canto/core/domain/user-media/use-cases/get-upcoming-schedule";
import { getLibraryHistory } from "@canto/core/domain/user-media/use-cases/get-library-history";
import { getWatchNext } from "@canto/core/domain/user-media/use-cases/get-watch-next";

export const feedRouter = createTRPCRouter({
  getUserMedia: protectedProcedure
    .input(getUserMediaInput)
    .query(async ({ ctx, input }) => {
      const offset = input.cursor ?? 0;
      const userLang = ctx.session.user.language;
      const libraryFeed = makeLibraryFeedRepository(ctx.db);
      const extras = makeMediaExtrasRepository(ctx.db);
      const result = await libraryFeed.findUserMediaPaginated(
        ctx.session.user.id,
        userLang,
        {
          status: input.status,
          hasRating: input.hasRating,
          isFavorite: input.isFavorite,
          isHidden: input.isHidden,
          mediaType: input.mediaType,
          sortBy: input.sortBy,
          sortOrder: input.sortOrder,
          limit: input.limit,
          offset,
        },
      );
      // Trailer keys are no longer joined inline in `mediaI18n` — batch-fetch
      // them once for the page so the UI hover-trailer feature still works
      // without paying for the per-row correlated subquery.
      const trailerByMediaId = await extras.findTrailerKeysForMediaIds(
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
    makeLibraryFeedRepository(ctx.db).findUserMediaCounts(ctx.session.user.id),
  ),

  getLibraryGenres: protectedProcedure.query(({ ctx }) =>
    makeLibraryFeedRepository(ctx.db).findLibraryGenres(ctx.session.user.id),
  ),

  getLibraryStats: protectedProcedure.query(({ ctx }) =>
    findUserLibraryStats(ctx.db, ctx.session.user.id),
  ),

  /**
   * @deprecated Use `getContinueWatching` (view='continue') or `getWatchNext`
   * (view='watch_next') instead. Retained for one release while frontends
   * migrate; new callers should pick the focused endpoint.
   */
  getLibraryWatchNext: protectedProcedure
    .input(getLibraryWatchNextInput)
    .query(({ ctx, input }) => {
      const userMedia = makeUserMediaRepository(ctx.db);
      const recs = makeRecommendationsRepository(ctx.db);
      const libraryFeed = makeLibraryFeedRepository(ctx.db);
      const extras = makeMediaExtrasRepository(ctx.db);
      return getLibraryWatchNext(
        ctx.db,
        { userMedia, recs, libraryFeed, extras },
        ctx.session.user.id,
        input,
      );
    }),

  getContinueWatching: protectedProcedure
    .input(getContinueWatchingInput)
    .query(({ ctx, input }) => {
      const libraryFeed = makeLibraryFeedRepository(ctx.db);
      const extras = makeMediaExtrasRepository(ctx.db);
      return getContinueWatching(
        ctx.db,
        { libraryFeed, extras },
        ctx.session.user.id,
        input,
      );
    }),

  getWatchNext: protectedProcedure
    .input(getWatchNextInput)
    .query(({ ctx, input }) => {
      const userMedia = makeUserMediaRepository(ctx.db);
      const recs = makeRecommendationsRepository(ctx.db);
      const libraryFeed = makeLibraryFeedRepository(ctx.db);
      const extras = makeMediaExtrasRepository(ctx.db);
      return getWatchNext(
        ctx.db,
        { userMedia, recs, libraryFeed, extras },
        ctx.session.user.id,
        input,
      );
    }),

  getUpcomingSchedule: protectedProcedure
    .input(getUpcomingScheduleInput)
    .query(({ ctx, input }) => {
      const libraryFeed = makeLibraryFeedRepository(ctx.db);
      return getUpcomingSchedule(
        ctx.db,
        { libraryFeed },
        ctx.session.user.id,
        input,
      );
    }),

  getLibraryHistory: protectedProcedure
    .input(getLibraryHistoryInput)
    .query(({ ctx, input }) => {
      const libraryFeed = makeLibraryFeedRepository(ctx.db);
      return getLibraryHistory(
        ctx.db,
        { libraryFeed },
        ctx.session.user.id,
        input,
      );
    }),
});
