import { TRPCError } from "@trpc/server";
import { z } from "zod";

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
  removeListItem,
  findMediaInLists,
} from "../infrastructure/repositories/list-repository";
import { dispatchRefreshExtras } from "../infrastructure/queue/bullmq-dispatcher";
import { deleteUserRecommendationsForSource, removeMediaFromUserRecs } from "../infrastructure/repositories/user-recommendation-repository";
import { addMediaToUserRecs } from "../domain/use-cases/rebuild-user-recs";
import { logAndSwallow } from "../lib/log-error";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const listRouter = createTRPCRouter({
  /** Get all lists for the current user + the shared Server Library */
  getAll: protectedProcedure.query(({ ctx }) =>
    findUserListsWithCounts(ctx.db, ctx.session.user.id),
  ),

  /** Get a single list by slug with paginated items */
  getBySlug: protectedProcedure
    .input(
      z.object({
        slug: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const listRow = await findListBySlug(
        ctx.db,
        input.slug,
        ctx.session.user.id,
      );
      if (!listRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
      }
      const items = await findListItems(ctx.db, listRow.id, {
        limit: input.limit,
        offset: input.offset,
      });
      return { list: listRow, items };
    }),

  /** Create a custom list */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
      }),
    )
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
          name: input.name,
          slug,
          description: input.description,
          type: "custom",
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes("unique")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A list with this name already exists",
          });
        }
        throw err;
      }
    }),

  /** Update a custom list (name/description) */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const listRow = await findListById(ctx.db, input.id);
      if (!listRow) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (listRow.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (listRow.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit system lists",
        });
      }

      const data: Parameters<typeof updateList>[2] = {};
      if (input.name) {
        data.name = input.name;
        data.slug = slugify(input.name);
      }
      if (input.description !== undefined) {
        data.description = input.description;
      }

      return updateList(ctx.db, input.id, data);
    }),

  /** Delete a custom list */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const listRow = await findListById(ctx.db, input.id);
      if (!listRow) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (listRow.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (listRow.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete system lists",
        });
      }

      await deleteList(ctx.db, input.id);
      return { success: true };
    }),

  /** Add a media item to a user's list */
  addItem: protectedProcedure
    .input(
      z.object({
        listId: z.string().uuid(),
        mediaId: z.string().uuid(),
        notes: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const listRow = await findListById(ctx.db, input.listId);
      if (!listRow) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      // Users can only add to their own lists
      if (listRow.type !== "server" && listRow.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Only admin can modify server library
      if (
        listRow.type === "server" &&
        ctx.session.user.role !== "admin"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const item = await addListItem(ctx.db, {
        listId: input.listId,
        mediaId: input.mediaId,
        notes: input.notes,
      });

      // 1. Remove the item itself from user's recommendations (it's now in a list)
      void removeMediaFromUserRecs(ctx.db, ctx.session.user.id, input.mediaId)
        .catch(logAndSwallow("list:addItem removeMediaFromUserRecs"));
      // 2. Enrich the media (credits, videos, recs) in background
      void dispatchRefreshExtras(input.mediaId)
        .catch(logAndSwallow("list:addItem dispatchRefreshExtras"));
      // 3. Add new recommendations based on this media (additive, instant)
      void addMediaToUserRecs(ctx.db, ctx.session.user.id, input.mediaId)
        .catch(logAndSwallow("list:addItem addMediaToUserRecs"));

      return item;
    }),

  /** Remove a media item from a list */
  removeItem: protectedProcedure
    .input(
      z.object({
        listId: z.string().uuid(),
        mediaId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const listRow = await findListById(ctx.db, input.listId);
      if (!listRow) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (listRow.type !== "server" && listRow.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (
        listRow.type === "server" &&
        ctx.session.user.role !== "admin"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await removeListItem(ctx.db, input.listId, input.mediaId);

      // Clean up per-user recommendation links sourced from the removed media
      void deleteUserRecommendationsForSource(ctx.db, ctx.session.user.id, input.mediaId).catch(logAndSwallow("list:removeItem deleteUserRecommendationsForSource"));

      return { success: true };
    }),

  /** Check which of the user's lists contain a given media item */
  isInLists: protectedProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      findMediaInLists(ctx.db, input.mediaId, ctx.session.user.id),
    ),

  /** Admin: add item to server library */
  addToServerLibrary: adminProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { ensureServerLibrary } = await import(
        "../infrastructure/repositories/list-repository"
      );
      const serverLib = await ensureServerLibrary(ctx.db);
      return addListItem(ctx.db, {
        listId: serverLib.id,
        mediaId: input.mediaId,
      });
    }),
});
