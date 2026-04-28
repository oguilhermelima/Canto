import {
  addListItemInput,
  getAllCollectionItemsInput,
  getByMediaIdInput,
  moveListItemsInput,
  removeListItemInput,
  removeListItemsInput,
  restoreListItemsInput,
} from "@canto/validators";
import { findMediaInLists } from "@canto/core/infra/lists/list-repository";
import {
  addItemToList,
  moveItemsBetweenLists,
  removeItemFromList,
  removeItemsFromList,
  restoreItemsToList,
} from "@canto/core/domain/lists/use-cases/manage-list-items";
import { addMediaToServerLibrary } from "@canto/core/domain/lists/use-cases/add-to-server-library";
import { viewAllCollectionItems } from "@canto/core/domain/lists/use-cases/view-all-collection-items";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "../../trpc";

export const listItemsRouter = createTRPCRouter({
  addItem: protectedProcedure
    .input(addListItemInput)
    .mutation(({ ctx, input }) =>
      addItemToList(ctx.db, input, ctx.session.user.id, ctx.session.user.role),
    ),

  removeItem: protectedProcedure
    .input(removeListItemInput)
    .mutation(({ ctx, input }) =>
      removeItemFromList(
        ctx.db,
        input,
        ctx.session.user.id,
        ctx.session.user.role,
      ),
    ),

  removeItems: protectedProcedure
    .input(removeListItemsInput)
    .mutation(({ ctx, input }) =>
      removeItemsFromList(
        ctx.db,
        input,
        ctx.session.user.id,
        ctx.session.user.role,
      ),
    ),

  moveItems: protectedProcedure
    .input(moveListItemsInput)
    .mutation(({ ctx, input }) =>
      moveItemsBetweenLists(
        ctx.db,
        input,
        ctx.session.user.id,
        ctx.session.user.role,
      ),
    ),

  restoreItems: protectedProcedure
    .input(restoreListItemsInput)
    .mutation(({ ctx, input }) =>
      restoreItemsToList(
        ctx.db,
        input,
        ctx.session.user.id,
        ctx.session.user.role,
      ),
    ),

  isInLists: protectedProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) =>
      findMediaInLists(ctx.db, input.mediaId, ctx.session.user.id),
    ),

  getAllCollectionItems: protectedProcedure
    .input(getAllCollectionItemsInput)
    .query(({ ctx, input }) =>
      viewAllCollectionItems(ctx.db, ctx.session.user.id, ctx.session.user.language, input),
    ),

  addToServerLibrary: adminProcedure
    .input(getByMediaIdInput)
    .mutation(({ ctx, input }) =>
      addMediaToServerLibrary(ctx.db, input.mediaId),
    ),
});
