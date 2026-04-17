import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { user } from "@canto/db/schema";
import { getUserLanguage } from "@canto/core/domain/services/user-service";
import { translateMediaItems } from "@canto/core/domain/services/translation-service";

import {
  getByIdInput,
  getByMediaIdInput,
  getListBySlugInput,
  createListInput,
  updateListInput,
  updateCollectionLayoutInput,
  reorderCollectionsInput,
  reorderListItemsInput,
  addListItemInput,
  removeListItemInput,
  addListMemberInput,
  updateListMemberInput,
  removeListMemberInput,
  createListInvitationInput,
  acceptListInvitationInput,
  getListMembersInput,
  getListVotesInput,
} from "@canto/validators";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import {
  findUserListsWithCounts,
  findListBySlug,
  findListById,
  createList,
  updateList,
  deleteList,
  reorderLists,
  findListItems,
  addListItem,
  reorderListItems,
  findMediaInLists,
  ensureServerLibrary,
} from "@canto/core/infrastructure/repositories/list-repository";
import {
  findUserPreferences,
  upsertUserPreference,
} from "@canto/core/infrastructure/repositories/library-repository";
import {
  findListMembers,
  addListMember,
  updateListMemberRole,
  removeListMember,
  createInvitation,
  findInvitationByToken,
  acceptInvitation,
  findPendingInvitations,
  getListMemberVotes,
} from "@canto/core/infrastructure/repositories/list-member-repository";

// ── Extracted rules & use-cases ──
import { slugify } from "@canto/core/domain/rules/slugify";
import { verifyListOwnership } from "@canto/core/domain/rules/list-ownership";
import { addItemToList, removeItemFromList } from "@canto/core/domain/use-cases/manage-list-items";

const COLLECTION_LAYOUT_PREF_KEY = "library.collectionLayout.v1";

export interface CollectionLayoutPreference {
  hiddenListIds: string[];
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function parseCollectionLayoutPreference(
  value: unknown,
): CollectionLayoutPreference {
  if (!value || typeof value !== "object") {
    return { hiddenListIds: [] };
  }

  const record = value as Record<string, unknown>;
  const hiddenListIds = Array.isArray(record.hiddenListIds)
    ? record.hiddenListIds.filter((id): id is string => typeof id === "string")
    : [];

  return { hiddenListIds: uniqueIds(hiddenListIds) };
}

function normalizeCollectionLayout(
  input: CollectionLayoutPreference,
  validListIds: Set<string>,
): CollectionLayoutPreference {
  return {
    hiddenListIds: input.hiddenListIds.filter((id) => validListIds.has(id)),
  };
}

export const listRouter = createTRPCRouter({
  getAll: protectedProcedure.query(({ ctx }) =>
    findUserListsWithCounts(ctx.db, ctx.session.user.id),
  ),

  getCollectionLayout: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [preferences, lists] = await Promise.all([
      findUserPreferences(ctx.db, userId),
      findUserListsWithCounts(ctx.db, userId),
    ]);

    const preferencesRecord = preferences as Record<string, unknown>;
    const layout = parseCollectionLayoutPreference(
      preferencesRecord[COLLECTION_LAYOUT_PREF_KEY],
    );
    const validListIds = new Set(
      lists
        .filter(
          (list) =>
            list.type === "watchlist" ||
            list.type === "custom" ||
            list.type === "server",
        )
        .map((list) => list.id),
    );
    return normalizeCollectionLayout(layout, validListIds);
  }),

  updateCollectionLayout: protectedProcedure
    .input(updateCollectionLayoutInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const lists = await findUserListsWithCounts(ctx.db, userId);
      const validListIds = new Set(
        lists
          .filter(
            (list) =>
              list.type === "watchlist" ||
              list.type === "custom" ||
              list.type === "server",
          )
          .map((list) => list.id),
      );

      const normalized = normalizeCollectionLayout(
        { hiddenListIds: uniqueIds(input.hiddenListIds) },
        validListIds,
      );

      await upsertUserPreference(
        ctx.db,
        userId,
        COLLECTION_LAYOUT_PREF_KEY,
        normalized,
      );

      return normalized;
    }),

  reorderCollections: protectedProcedure
    .input(reorderCollectionsInput)
    .mutation(async ({ ctx, input }) => {
      await reorderLists(ctx.db, ctx.session.user.id, input.orderedIds);
      void ctx.db; // invalidate client-side via onSuccess
    }),

  reorderItems: protectedProcedure
    .input(reorderListItemsInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(ctx.db, input.listId, ctx.session.user.id, ctx.session.user.role, {
        requiredPermission: "edit",
      });
      await reorderListItems(ctx.db, input.listId, input.orderedItemIds);
    }),

  getBySlug: protectedProcedure
    .input(getListBySlugInput)
    .query(async ({ ctx, input }) => {
      const listRow = await findListBySlug(ctx.db, input.slug, ctx.session.user.id);
      if (!listRow) throw new TRPCError({ code: "NOT_FOUND", message: "List not found" });
      const { items: rawItems, total } = await findListItems(ctx.db, listRow.id, {
        userId: ctx.session.user.id,
        limit: input.limit,
        offset: input.cursor ?? input.offset,
        genreIds: input.genreIds,
        genreMode: input.genreMode ?? "or",
        language: input.language,
        scoreMin: input.scoreMin,
        scoreMax: input.scoreMax,
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
      const userLang = await getUserLanguage(ctx.db, ctx.session.user.id);
      const translatedMedia = await translateMediaItems(ctx.db, rawItems.map((i) => i.media), userLang);
      const items = rawItems.map((item, idx) => ({ ...item, media: translatedMedia[idx]! }));
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

      // Default visibility to user's profile visibility
      let visibility = input.visibility;
      if (!visibility) {
        const [userRow] = await ctx.db
          .select({ isPublic: user.isPublic })
          .from(user)
          .where(eq(user.id, ctx.session.user.id));
        visibility = userRow?.isPublic ? "public" : "private";
      }

      try {
        return await createList(ctx.db, {
          userId: ctx.session.user.id,
          name: input.name, slug,
          description: input.description,
          type: "custom",
          visibility,
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
      await verifyListOwnership(ctx.db, input.id, ctx.session.user.id, ctx.session.user.role, {
        requiredPermission: "admin",
      });
      const data: Parameters<typeof updateList>[2] = {};
      if (input.name) {
        data.name = input.name;
        data.slug = slugify(input.name);
      }
      if (input.description !== undefined) data.description = input.description;
      if (input.visibility !== undefined) data.visibility = input.visibility;
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
      const serverLib = await ensureServerLibrary(ctx.db);
      return addListItem(ctx.db, { listId: serverLib.id, mediaId: input.mediaId });
    }),

  // ── Members ──

  getMembers: protectedProcedure
    .input(getListMembersInput)
    .query(async ({ ctx, input }) => {
      await verifyListOwnership(ctx.db, input.listId, ctx.session.user.id, ctx.session.user.role, {
        requiredPermission: "view",
      });
      const [members, invitations, listRow] = await Promise.all([
        findListMembers(ctx.db, input.listId),
        findPendingInvitations(ctx.db, input.listId),
        findListById(ctx.db, input.listId),
      ]);

      // Include owner info
      let owner = null;
      if (listRow?.userId) {
        const [ownerRow] = await ctx.db
          .select({ id: user.id, name: user.name, email: user.email, image: user.image })
          .from(user)
          .where(eq(user.id, listRow.userId));
        owner = ownerRow ?? null;
      }

      return { members, invitations, owner };
    }),

  addMember: protectedProcedure
    .input(addListMemberInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(ctx.db, input.listId, ctx.session.user.id, ctx.session.user.role, {
        requiredPermission: "admin",
      });
      return addListMember(ctx.db, {
        listId: input.listId,
        userId: input.userId,
        role: input.role,
      });
    }),

  updateMember: protectedProcedure
    .input(updateListMemberInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(ctx.db, input.listId, ctx.session.user.id, ctx.session.user.role, {
        requiredPermission: "admin",
      });
      return updateListMemberRole(ctx.db, input.listId, input.userId, input.role);
    }),

  removeMember: protectedProcedure
    .input(removeListMemberInput)
    .mutation(async ({ ctx, input }) => {
      const listRow = await findListById(ctx.db, input.listId);
      if (!listRow) throw new TRPCError({ code: "NOT_FOUND" });

      // Users can remove themselves, or admins/owners can remove others
      const isSelf = input.userId === ctx.session.user.id;
      if (!isSelf) {
        await verifyListOwnership(ctx.db, input.listId, ctx.session.user.id, ctx.session.user.role, {
          requiredPermission: "admin",
        });
      }

      await removeListMember(ctx.db, input.listId, input.userId);
      return { success: true };
    }),

  // ── Invitations ──

  createInvitation: protectedProcedure
    .input(createListInvitationInput)
    .mutation(async ({ ctx, input }) => {
      await verifyListOwnership(ctx.db, input.listId, ctx.session.user.id, ctx.session.user.role, {
        requiredPermission: "admin",
      });
      return createInvitation(ctx.db, {
        listId: input.listId,
        invitedBy: ctx.session.user.id,
        invitedEmail: input.email,
        invitedUserId: input.userId,
        role: input.role,
      });
    }),

  acceptInvitation: protectedProcedure
    .input(acceptListInvitationInput)
    .mutation(async ({ ctx, input }) => {
      const invitation = await findInvitationByToken(ctx.db, input.token);
      if (!invitation) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
      if (invitation.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation already used" });
      }
      if (new Date() > invitation.expiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation expired" });
      }

      await acceptInvitation(ctx.db, input.token);
      await addListMember(ctx.db, {
        listId: invitation.listId,
        userId: ctx.session.user.id,
        role: invitation.role,
      });

      return { success: true, listId: invitation.listId };
    }),

  // ── Vote Aggregation ──

  getVotes: protectedProcedure
    .input(getListVotesInput)
    .query(async ({ ctx, input }) => {
      await verifyListOwnership(ctx.db, input.listId, ctx.session.user.id, ctx.session.user.role, {
        requiredPermission: "view",
      });
      return getListMemberVotes(ctx.db, input.listId, input.mediaIds);
    }),
});
