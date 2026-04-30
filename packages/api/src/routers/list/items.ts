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
      const repo = makeListsRepository(ctx.db);
      return addItemToList(
        { repo },
        ctx.db,
        input,
        ctx.session.user.id,
        ctx.session.user.role,
      );
    }),

  removeItem: protectedProcedure
    .input(removeListItemInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return removeItemFromList(
        { repo },
        ctx.db,
        input,
        ctx.session.user.id,
        ctx.session.user.role,
      );
    }),

  removeItems: protectedProcedure
    .input(removeListItemsInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return removeItemsFromList(
        { repo },
        ctx.db,
        input,
        ctx.session.user.id,
        ctx.session.user.role,
      );
    }),

  moveItems: protectedProcedure
    .input(moveListItemsInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return moveItemsBetweenLists(
        { repo },
        input,
        ctx.session.user.id,
        ctx.session.user.role,
      );
    }),

  restoreItems: protectedProcedure
    .input(restoreListItemsInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return restoreItemsToList(
        { repo },
        input,
        ctx.session.user.id,
        ctx.session.user.role,
      );
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
        ctx.db,
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
