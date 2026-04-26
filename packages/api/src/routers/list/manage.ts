import {
  getByIdInput,
  createListInput,
  updateListInput,
  updateCollectionLayoutInput,
  reorderCollectionsInput,
  reorderListItemsInput,
  getListBySlugInput,
} from "@canto/validators";
import { verifyListOwnership } from "@canto/core/domain/lists/rules/list-rules";
import {
  deleteList,
  findUserListsWithCounts,
  reorderLists,
  reorderListItems,
  softDeleteList,
} from "@canto/core/infra/lists/list-repository";
import { findTraktListLinkByLocalListId } from "@canto/core/infra/trakt/trakt-sync-aggregate-repository";
import { dispatchTraktListDelete } from "@canto/core/platform/queue/bullmq-dispatcher";
import { createListForUser } from "@canto/core/domain/lists/use-cases/create-list";
import { updateListForUser } from "@canto/core/domain/lists/use-cases/update-list";
import { viewListBySlug } from "@canto/core/domain/lists/use-cases/view-list";
import {
  getCollectionLayout,
  updateCollectionLayout,
} from "@canto/core/domain/lists/use-cases/collection-layout";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

export const listManageRouter = createTRPCRouter({
  getAll: protectedProcedure.query(({ ctx }) =>
    findUserListsWithCounts(ctx.db, ctx.session.user.id, ctx.session.user.language),
  ),

  getCollectionLayout: protectedProcedure.query(({ ctx }) =>
    getCollectionLayout(ctx.db, ctx.session.user.id, ctx.session.user.language),
  ),

  updateCollectionLayout: protectedProcedure
    .input(updateCollectionLayoutInput)
    .mutation(({ ctx, input }) =>
      updateCollectionLayout(ctx.db, ctx.session.user.id, ctx.session.user.language, input),
    ),

  reorderCollections: protectedProcedure
    .input(reorderCollectionsInput)
    .mutation(({ ctx, input }) =>
      reorderLists(ctx.db, ctx.session.user.id, input.orderedIds),
    ),

  reorderItems: protectedProcedure
    .input(reorderListItemsInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(
        ctx.db,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
        { requiredPermission: "edit" },
      );
      await reorderListItems(ctx.db, input.listId, input.orderedItemIds);
    }),

  getBySlug: protectedProcedure
    .input(getListBySlugInput)
    .query(({ ctx, input }) =>
      viewListBySlug(ctx.db, ctx.session.user.id, ctx.session.user.language, input),
    ),

  create: protectedProcedure
    .input(createListInput)
    .mutation(({ ctx, input }) =>
      createListForUser(ctx.db, ctx.session.user.id, input),
    ),

  update: protectedProcedure
    .input(updateListInput)
    .mutation(({ ctx, input }) =>
      updateListForUser(
        ctx.db,
        ctx.session.user.id,
        ctx.session.user.role,
        input,
      ),
    ),

  delete: protectedProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(
        ctx.db,
        input.id,
        ctx.session.user.id,
        ctx.session.user.role,
      );

      // If the list is mirrored to Trakt, soft-delete + queue a remote delete.
      // Hard-deleting locally first would orphan the Trakt list (the link
      // cascade-drops with the list), and the next sync would re-import it as
      // an empty list. Worker hard-deletes once Trakt confirms removal.
      const traktLink = await findTraktListLinkByLocalListId(ctx.db, input.id);
      if (traktLink) {
        await softDeleteList(ctx.db, input.id);
        void dispatchTraktListDelete(input.id);
      } else {
        await deleteList(ctx.db, input.id);
      }
      return { success: true };
    }),
});
