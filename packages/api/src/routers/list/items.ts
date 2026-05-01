import {
  addListItemInput,
  getAllCollectionItemsInput,
  getByMediaIdInput,
  moveListItemsInput,
  removeListItemInput,
  removeListItemsInput,
  restoreListItemsInput,
} from "@canto/validators";
import { makeListsRepository } from "@canto/core/infra/lists/lists-repository.adapter";
import { makeRecommendationsRepository } from "@canto/core/infra/recommendations/recommendations-repository.adapter";
import { makeUserMediaRepository } from "@canto/core/infra/user-media/user-media-repository.adapter";
import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";
import { jobDispatcher } from "@canto/core/platform/queue/job-dispatcher.adapter";
import { addMediaToServerLibrary } from "@canto/core/domain/lists/use-cases/add-to-server-library";
import {
  addItemToList,
  moveItemsBetweenLists,
  removeItemFromList,
  removeItemsFromList,
  restoreItemsToList,
} from "@canto/core/domain/lists/use-cases/manage-list-items";
import { viewAllCollectionItems } from "@canto/core/domain/lists/use-cases/view-all-collection-items";
import {
  createTRPCRouter,
  adminProcedure,
  protectedProcedure,
} from "../../trpc";

export const listItemsRouter = createTRPCRouter({
  addItem: protectedProcedure
    .input(addListItemInput)
    .mutation(({ ctx, input }) => {
      const deps = {
        repo: makeListsRepository(ctx.db),
        recs: makeRecommendationsRepository(ctx.db),
        userMedia: makeUserMediaRepository(ctx.db),
        logger: makeConsoleLogger(),
        dispatcher: jobDispatcher,
      };
      return addItemToList(deps, input, ctx.session.user.id, ctx.session.user.role);
    }),

  removeItem: protectedProcedure
    .input(removeListItemInput)
    .mutation(({ ctx, input }) => {
      const deps = {
        repo: makeListsRepository(ctx.db),
        recs: makeRecommendationsRepository(ctx.db),
        userMedia: makeUserMediaRepository(ctx.db),
        logger: makeConsoleLogger(),
        dispatcher: jobDispatcher,
      };
      return removeItemFromList(deps, input, ctx.session.user.id, ctx.session.user.role);
    }),

  removeItems: protectedProcedure
    .input(removeListItemsInput)
    .mutation(({ ctx, input }) => {
      const deps = {
        repo: makeListsRepository(ctx.db),
        recs: makeRecommendationsRepository(ctx.db),
        userMedia: makeUserMediaRepository(ctx.db),
        logger: makeConsoleLogger(),
        dispatcher: jobDispatcher,
      };
      return removeItemsFromList(deps, input, ctx.session.user.id, ctx.session.user.role);
    }),

  moveItems: protectedProcedure
    .input(moveListItemsInput)
    .mutation(({ ctx, input }) => {
      const deps = {
        repo: makeListsRepository(ctx.db),
        recs: makeRecommendationsRepository(ctx.db),
        userMedia: makeUserMediaRepository(ctx.db),
        logger: makeConsoleLogger(),
        dispatcher: jobDispatcher,
      };
      return moveItemsBetweenLists(deps, input, ctx.session.user.id, ctx.session.user.role);
    }),

  restoreItems: protectedProcedure
    .input(restoreListItemsInput)
    .mutation(({ ctx, input }) => {
      const deps = {
        repo: makeListsRepository(ctx.db),
        recs: makeRecommendationsRepository(ctx.db),
        userMedia: makeUserMediaRepository(ctx.db),
        logger: makeConsoleLogger(),
        dispatcher: jobDispatcher,
      };
      return restoreItemsToList(deps, input, ctx.session.user.id, ctx.session.user.role);
    }),

  isInLists: protectedProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return repo.findMediaInLists(input.mediaId, ctx.session.user.id);
    }),

  getAllCollectionItems: protectedProcedure
    .input(getAllCollectionItemsInput)
    .query(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return viewAllCollectionItems(
        { repo },
        ctx.session.user.id,
        ctx.session.user.language,
        input,
      );
    }),

  addToServerLibrary: adminProcedure
    .input(getByMediaIdInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return addMediaToServerLibrary({ repo }, input.mediaId);
    }),
});
