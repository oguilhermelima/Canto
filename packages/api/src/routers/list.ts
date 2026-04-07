import { TRPCError } from "@trpc/server";

import {
  getByIdInput,
  getByMediaIdInput,
  getListBySlugInput,
  createListInput,
  updateListInput,
  addListItemInput,
  removeListItemInput,
} from "@canto/validators";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import {
  findUserListsWithCounts,
  findListBySlug,
  findListById,
  createList,
  updateList,
  deleteList,
  findListItems,
  addListItem,
  findMediaInLists,
} from "../infrastructure/repositories/list-repository";

// ── Extracted rules & use-cases ──
import { slugify } from "../domain/rules/slugify";
import { verifyListOwnership } from "../domain/rules/list-ownership";
import { addItemToList, removeItemFromList } from "../domain/use-cases/manage-list-items";

export const listRouter = createTRPCRouter({
  getAll: protectedProcedure.query(({ ctx }) =>
    findUserListsWithCounts(ctx.db, ctx.session.user.id),
  ),

  getBySlug: protectedProcedure
    .input(getListBySlugInput)
    .query(async ({ ctx, input }) => {
      const listRow = await findListBySlug(ctx.db, input.slug, ctx.session.user.id);
      if (!listRow) throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
      const { items, total } = await findListItems(ctx.db, listRow.id, {
        limit: input.limit,
        offset: input.cursor ?? input.offset,
        genreIds: input.genreIds,
        genreMode: input.genreMode ?? "or",
        language: input.language,
        scoreMin: input.scoreMin,
        yearMin: input.yearMin,
        yearMax: input.yearMax,
        runtimeMin: input.runtimeMin,
        runtimeMax: input.runtimeMax,
        certification: input.certification,
        status: input.status,
        sortBy: input.sortBy,
        watchProviders: input.watchProviders,
        watchRegion: input.watchRegion,
      });
      return { list: listRow, items, total };
    }),

  create: protectedProcedure
    .input(createListInput)
    .mutation(async ({ ctx, input }) => {
      const slug = slugify(input.name);
      if (!slug || slug === "server-library" || slug === "watchlist") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: slug
            ? "This list name is reserved"
            : "List name must contain at least one letter or number",
        });
      }
      try {
        return await createList(ctx.db, {
          userId: ctx.session.user.id,
          name: input.name, slug,
          description: input.description,
          type: "custom",
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes("unique")) {
          throw new TRPCError({ code: "CONFLICT", message: "A list with this name already exists" });
        }
        throw err;
      }
    }),

  update: protectedProcedure
    .input(updateListInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(ctx.db, input.id, ctx.session.user.id, ctx.session.user.role);
      const data: Parameters<typeof updateList>[2] = {};
      if (input.name) {
        data.name = input.name;
        data.slug = slugify(input.name);
      }
      if (input.description !== undefined) data.description = input.description;
      return updateList(ctx.db, input.id, data);
    }),

  delete: protectedProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(ctx.db, input.id, ctx.session.user.id, ctx.session.user.role);
      await deleteList(ctx.db, input.id);
      return { success: true };
    }),

  addItem: protectedProcedure
    .input(addListItemInput)
    .mutation(({ ctx, input }) =>
      addItemToList(ctx.db, input, ctx.session.user.id, ctx.session.user.role),
    ),

  removeItem: protectedProcedure
    .input(removeListItemInput)
    .mutation(({ ctx, input }) =>
      removeItemFromList(ctx.db, input, ctx.session.user.id, ctx.session.user.role),
    ),

  isInLists: protectedProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) =>
      findMediaInLists(ctx.db, input.mediaId, ctx.session.user.id),
    ),

  addToServerLibrary: adminProcedure
    .input(getByMediaIdInput)
    .mutation(async ({ ctx, input }) => {
      const { ensureServerLibrary } = await import(
        "../infrastructure/repositories/list-repository"
      );
      const serverLib = await ensureServerLibrary(ctx.db);
      return addListItem(ctx.db, { listId: serverLib.id, mediaId: input.mediaId });
    }),
});
