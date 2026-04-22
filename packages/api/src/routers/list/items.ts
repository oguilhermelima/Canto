import {
  addListItemInput,
  getByMediaIdInput,
  removeListItemInput,
} from "@canto/validators";
import { findMediaInLists } from "@canto/core/infra/lists/list-repository";
import {
  addItemToList,
  removeItemFromList,
} from "@canto/core/domain/use-cases/lists/manage-list-items";
import { addMediaToServerLibrary } from "@canto/core/domain/use-cases/lists/add-to-server-library";
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

  isInLists: protectedProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) =>
      findMediaInLists(ctx.db, input.mediaId, ctx.session.user.id),
    ),

  addToServerLibrary: adminProcedure
    .input(getByMediaIdInput)
    .mutation(({ ctx, input }) =>
      addMediaToServerLibrary(ctx.db, input.mediaId),
    ),
});
