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
import { makeListsRepository } from "@canto/core/infra/lists/lists-repository.adapter";
import { findUserListsWithCounts } from "@canto/core/infra/lists/list-repository";
import { makeTraktRepository } from "@canto/core/infra/trakt/trakt-repository.adapter";
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

  getCollectionLayout: protectedProcedure.query(({ ctx }) => {
    const repo = makeListsRepository(ctx.db);
    return getCollectionLayout(
      { repo },
      ctx.db,
      ctx.session.user.id,
      ctx.session.user.language,
    );
  }),

  updateCollectionLayout: protectedProcedure
    .input(updateCollectionLayoutInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return updateCollectionLayout(
        { repo },
        ctx.db,
        ctx.session.user.id,
        ctx.session.user.language,
        input,
      );
    }),

  reorderCollections: protectedProcedure
    .input(reorderCollectionsInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return repo.reorder(ctx.session.user.id, input.orderedIds);
    }),

  reorderItems: protectedProcedure
    .input(reorderListItemsInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      await verifyListOwnership(
        repo,
        input.listId,
        ctx.session.user.id,
        ctx.session.user.role,
        { requiredPermission: "edit" },
      );
      await repo.reorderItems(input.listId, input.orderedItemIds);
    }),

  getBySlug: protectedProcedure
    .input(getListBySlugInput)
    .query(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return viewListBySlug(
        { repo },
        ctx.db,
        ctx.session.user.id,
        ctx.session.user.language,
        input,
      );
    }),

  create: protectedProcedure
    .input(createListInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return createListForUser({ repo }, ctx.session.user.id, input);
    }),

  update: protectedProcedure
    .input(updateListInput)
    .mutation(({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      return updateListForUser(
        { repo },
        ctx.session.user.id,
        ctx.session.user.role,
        input,
      );
    }),

  delete: protectedProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      await verifyListOwnership(
        repo,
        input.id,
        ctx.session.user.id,
        ctx.session.user.role,
      );

      // If the list is mirrored to Trakt, soft-delete + queue a remote delete.
      // Hard-deleting locally first would orphan the Trakt list (the link
      // cascade-drops with the list), and the next sync would re-import it as
      // an empty list. Worker hard-deletes once Trakt confirms removal.
      const traktRepo = makeTraktRepository(ctx.db);
      const traktLink = await traktRepo.findListLinkByLocalListId(input.id);
      if (traktLink) {
        await repo.softDelete(input.id);
        void dispatchTraktListDelete(input.id);
      } else {
        await repo.hardDelete(input.id);
      }
      return { success: true };
    }),
});
