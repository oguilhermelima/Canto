import type { Database } from "@canto/db/client";
import type {
  CollectionItemDetail,
  ListItemDetail,
} from "@canto/core/domain/lists/types/list-item";
import type { ListWithCounts } from "@canto/core/domain/lists/types/list";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";

type ListWithCountsResult = ListWithCounts[];
type ListItemsResult = { items: ListItemDetail[]; total: number };
type CollectionItemsResult = { items: CollectionItemDetail[]; total: number };
import {
  addListItem,
  createList,
  deleteList,
  ensureServerLibrary,
  findListById,
  findListByIdIncludingDeleted,
  findListBySlug,
  findListItems,
  findListItemsForSync,
  findListOwnerSummary,
  findMediaInLists,
  findPublicListBySlug,
  findServerLibrary,
  findTombstonedTraktLists,
  findUserCustomCollectionItems,
  findUserCustomLists,
  findUserDefaultVisibility,
  findUserListByType,
  findUserListExternalIds,
  findUserListsWithCounts,
  findUserTombstonedListIds,
  hardDeleteList,
  markListItemsPushed,
  moveListItems,
  removeListItem,
  removeListItems,
  reorderListItems,
  reorderLists,
  restoreListItems,
  softDeleteList,
  updateList,
} from "@canto/core/infra/lists/list-repository";
import {
  findUserPreferences,
  upsertUserPreference,
} from "@canto/core/infra/file-organization/library-repository";
import {
  acceptInvitation,
  addListMember,
  createInvitation,
  findInvitationByToken,
  findListMember,
  findListMembers,
  findPendingInvitations,
  getListMemberVotes,
  removeListMember,
  updateListMemberRole,
} from "@canto/core/infra/lists/member-repository";
import {
  toDomain as listToDomain,
  toOwnerSummary as listToOwnerSummary,
  toRow as listToRow,
  toTombstone,
  toUpdateRow as listToUpdateRow,
} from "@canto/core/infra/lists/list.mapper";
import {
  toDomain as listItemToDomain,
  toMediaInListSummary,
  toRow as listItemToRow,
} from "@canto/core/infra/lists/list-item.mapper";
import {
  toDomain as listMemberToDomain,
  toMemberWithUser,
  toRow as listMemberToRow,
} from "@canto/core/infra/lists/list-member.mapper";
import {
  toDomain as listInvitationToDomain,
  toInvitationRow,
  toPendingInvitation,
} from "@canto/core/infra/lists/list-invitation.mapper";

export function makeListsRepository(db: Database): ListsRepositoryPort {
  return {
    // ── Lists ──
    findById: async (id) => {
      const row = await findListById(db, id);
      return row ? listToDomain(row) : null;
    },
    findByIdIncludingDeleted: async (id) => {
      const row = await findListByIdIncludingDeleted(db, id);
      return row ? listToDomain(row) : null;
    },
    findBySlug: async (slug, userId) => {
      const row = await findListBySlug(db, slug, userId);
      return row ? listToDomain(row) : null;
    },
    findPublicBySlug: async (slug, ownerUserId) => {
      const row = await findPublicListBySlug(db, slug, ownerUserId);
      return row ? listToDomain(row) : null;
    },
    findUserDefaultVisibility: async (userId) =>
      findUserDefaultVisibility(db, userId),
    findOwnerSummary: async (ownerId) => {
      const row = await findListOwnerSummary(db, ownerId);
      return row ? listToOwnerSummary(row) : null;
    },
    findServerLibrary: async () => {
      const row = await findServerLibrary(db);
      return row ? listToDomain(row) : null;
    },
    findTombstonedTraktLists: async () => {
      const rows = await findTombstonedTraktLists(db);
      return rows.map(toTombstone);
    },
    findUserCustomLists: async (userId) => {
      const rows = await findUserCustomLists(db, userId);
      return rows.map(listToDomain);
    },
    findUserTombstonedListIds: (userId) =>
      findUserTombstonedListIds(db, userId),
    findUserListByType: async (userId, type) => {
      const row = await findUserListByType(db, userId, type);
      return row ? listToDomain(row) : null;
    },
    ensureServerLibrary: async () => {
      const row = await ensureServerLibrary(db);
      return listToDomain(row);
    },
    create: async (input) => {
      const row = await createList(db, listToRow(input));
      return listToDomain(row);
    },
    update: async (id, input) => {
      const row = await updateList(db, id, listToUpdateRow(input));
      return row ? listToDomain(row) : undefined;
    },
    softDelete: async (id) => {
      await softDeleteList(db, id);
    },
    hardDelete: async (id) => {
      await hardDeleteList(db, id);
      // `deleteList` is the original (CASCADE-on-list) hard delete; both
      // entry points map to the same SQL, so pick one and stay consistent.
      void deleteList;
    },
    reorder: async (userId, orderedIds) => {
      await reorderLists(db, userId, orderedIds);
    },

    // ── List Items ──
    addItem: async (input) => {
      const row = await addListItem(db, listItemToRow(input));
      return row ? listItemToDomain(row) : undefined;
    },
    removeItem: async (listId, mediaId, actor) => {
      await removeListItem(db, listId, mediaId, actor);
    },
    removeItems: async (listId, mediaIds, actor) => {
      await removeListItems(db, listId, mediaIds, actor);
    },
    restoreItems: async (listId, mediaIds) =>
      restoreListItems(db, listId, mediaIds),
    moveItems: async (fromListId, toListId, mediaIds) => {
      await moveListItems(db, fromListId, toListId, mediaIds);
    },
    reorderItems: async (listId, orderedItemIds) => {
      await reorderListItems(db, listId, orderedItemIds);
    },
    markItemsPushed: async (listId, mediaIds, pushedAt) => {
      await markListItemsPushed(db, listId, mediaIds, pushedAt);
    },
    findMediaInLists: async (mediaId, userId) => {
      const rows = await findMediaInLists(db, mediaId, userId);
      return rows.map(toMediaInListSummary);
    },
    findItemsForSync: (listId) => findListItemsForSync(db, listId),
    findUserListExternalIds: (userId) => findUserListExternalIds(db, userId),

    // ── Members ──
    findMembers: async (listId) => {
      const rows = await findListMembers(db, listId);
      return rows.map(toMemberWithUser);
    },
    findMember: async (listId, userId) => {
      const row = await findListMember(db, listId, userId);
      return row ? listMemberToDomain(row) : undefined;
    },
    addMember: async (input) => {
      const row = await addListMember(db, listMemberToRow(input));
      return row ? listMemberToDomain(row) : undefined;
    },
    updateMemberRole: async (listId, userId, role) => {
      const row = await updateListMemberRole(db, listId, userId, role);
      return row ? listMemberToDomain(row) : undefined;
    },
    removeMember: async (listId, userId) => {
      await removeListMember(db, listId, userId);
    },

    // ── Invitations ──
    createInvitation: async (input) => {
      const row = await createInvitation(db, toInvitationRow(input));
      return listInvitationToDomain(row);
    },
    findInvitationByToken: async (token) => {
      const row = await findInvitationByToken(db, token);
      return row ? listInvitationToDomain(row) : null;
    },
    acceptInvitation: async (token) => {
      const row = await acceptInvitation(db, token);
      return row ? listInvitationToDomain(row) : undefined;
    },
    findPendingInvitations: async (listId) => {
      const rows = await findPendingInvitations(db, listId);
      return rows.map(toPendingInvitation);
    },

    // ── Aggregating reads ──
    // Drizzle returns plain `string` ids; the domain types use branded `ListId`
    // and `ListItemId`. The casts via `unknown` are safe — UUIDs are identical
    // at runtime and only differ in TypeScript's nominal brand.
    findUserListsWithCounts: async (userId, userLang) => {
      const rows = await findUserListsWithCounts(db, userId, userLang);
      return rows as unknown as ListWithCountsResult;
    },

    findListItems: async (listId, userLang, opts) => {
      const result = await findListItems(db, listId, userLang, opts);
      return result as unknown as ListItemsResult;
    },

    findUserCustomCollectionItems: async (userId, userLang, hiddenListIds, opts) => {
      const result = await findUserCustomCollectionItems(db, userId, userLang, hiddenListIds, opts);
      return result as unknown as CollectionItemsResult;
    },

    listMemberVotes: (listId, mediaIds) =>
      getListMemberVotes(db, listId, mediaIds),

    // ── User preferences ──
    findUserPreferences: async (userId) => {
      const prefs = await findUserPreferences(db, userId);
      return prefs as Record<string, unknown>;
    },

    upsertUserPreference: (userId, key, value) =>
      upsertUserPreference(db, userId, key, value),
  };
}
