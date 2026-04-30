import type { CollectionWatchStatus } from "@canto/validators";
import type {
  List,
  ListOwnerSummary,
  ListTombstone,
  ListWithCounts,
  NewList,
  UpdateListInput,
} from "@canto/core/domain/lists/types/list";
import type {
  CollectionItemDetail,
  ListItem,
  ListItemActor,
  ListItemDetail,
  MediaInListSummary,
  NewListItem,
} from "@canto/core/domain/lists/types/list-item";
import type {
  ListMember,
  ListMemberWithUser,
  MemberRole,
  NewListMember,
} from "@canto/core/domain/lists/types/list-member";
import type {
  ListInvitation,
  NewListInvitation,
  PendingInvitation,
} from "@canto/core/domain/lists/types/list-invitation";
import type { RecsFilters } from "@canto/core/domain/recommendations/types/recs-filters";

/** Options accepted by {@link ListsRepositoryPort.findListItems}. */
export interface FindListItemsOpts extends RecsFilters {
  userId?: string;
  limit?: number;
  offset?: number;
  watchStatuses?: CollectionWatchStatus[];
  hideCompleted?: boolean;
  hideDropped?: boolean;
  showHidden?: boolean;
}

/** Options accepted by {@link ListsRepositoryPort.findUserCustomCollectionItems}. */
export interface FindCollectionItemsOpts extends RecsFilters {
  limit?: number;
  offset?: number;
  watchStatuses?: CollectionWatchStatus[];
  hideCompleted?: boolean;
  hideDropped?: boolean;
  showHidden?: boolean;
}

/**
 * The `ListsRepositoryPort` covers CRUD on `list`, `list_item`, `list_member`,
 * and `list_invitation` — the four tables that compose the lists context.
 * Also exposes heavy aggregating reads and user-preference helpers that were
 * previously accessed via direct infra imports in list use-cases (Wave 10).
 */
export interface ListsRepositoryPort {
  // ── Lists ──

  findById(id: string): Promise<List | null>;
  /** Bypass the `deletedAt IS NULL` filter — used by the worker that processes
   *  pending Trakt deletions on tombstoned rows. */
  findByIdIncludingDeleted(id: string): Promise<List | null>;
  findBySlug(slug: string, userId: string): Promise<List | null>;
  findPublicBySlug(slug: string, ownerUserId: string): Promise<List | null>;
  findUserDefaultVisibility(userId: string): Promise<"public" | "private">;
  findOwnerSummary(ownerId: string): Promise<ListOwnerSummary | null>;
  findServerLibrary(): Promise<List | null>;
  findTombstonedTraktLists(): Promise<ListTombstone[]>;
  ensureServerLibrary(): Promise<List>;
  create(input: NewList): Promise<List>;
  update(id: string, input: UpdateListInput): Promise<List | undefined>;
  softDelete(id: string): Promise<void>;
  hardDelete(id: string): Promise<void>;
  reorder(userId: string, orderedIds: string[]): Promise<void>;

  // ── List Items ──

  addItem(input: NewListItem): Promise<ListItem | undefined>;
  removeItem(
    listId: string,
    mediaId: string,
    actor?: ListItemActor,
  ): Promise<void>;
  removeItems(
    listId: string,
    mediaIds: string[],
    actor?: ListItemActor,
  ): Promise<void>;
  restoreItems(listId: string, mediaIds: string[]): Promise<number>;
  moveItems(
    fromListId: string,
    toListId: string,
    mediaIds: string[],
  ): Promise<void>;
  reorderItems(listId: string, orderedItemIds: string[]): Promise<void>;
  findMediaInLists(
    mediaId: string,
    userId: string,
  ): Promise<MediaInListSummary[]>;

  // ── Members ──

  findMembers(listId: string): Promise<ListMemberWithUser[]>;
  findMember(listId: string, userId: string): Promise<ListMember | undefined>;
  addMember(input: NewListMember): Promise<ListMember | undefined>;
  updateMemberRole(
    listId: string,
    userId: string,
    role: MemberRole,
  ): Promise<ListMember | undefined>;
  removeMember(listId: string, userId: string): Promise<void>;

  // ── Invitations ──

  createInvitation(input: NewListInvitation): Promise<ListInvitation>;
  findInvitationByToken(token: string): Promise<ListInvitation | null>;
  acceptInvitation(token: string): Promise<ListInvitation | undefined>;
  findPendingInvitations(listId: string): Promise<PendingInvitation[]>;

  // ── Aggregating reads (cross-context, previously direct infra calls) ──

  /** All lists visible to a user (owned + member + server), with item counts
   *  and up-to-4 preview posters. Used by the collection-layout sidebar and
   *  the library overview. */
  findUserListsWithCounts(
    userId: string,
    userLang: string,
  ): Promise<ListWithCounts[]>;

  /** Paginated list-item fetch with full media localization overlay, optional
   *  member-vote aggregation, per-user state, and multi-collection membership
   *  hint. Used by `viewListBySlug`. */
  findListItems(
    listId: string,
    userLang: string,
    opts: FindListItemsOpts,
  ): Promise<{ items: ListItemDetail[]; total: number }>;

  /** Combined "all my custom-collection items" view — deduplicates across
   *  lists, respects the collection-layout hidden-list filter, supports the
   *  same filter/sort surface as `findListItems`. */
  findUserCustomCollectionItems(
    userId: string,
    userLang: string,
    hiddenListIds: string[],
    opts: FindCollectionItemsOpts,
  ): Promise<{ items: CollectionItemDetail[]; total: number }>;

  // ── User preferences (file-organization context, via library-repository) ──

  /** All stored key/value preferences for a user. Returns a plain record with
   *  a `defaultQuality` sentinel so callers don't need to handle the empty
   *  case. */
  findUserPreferences(userId: string): Promise<Record<string, unknown>>;

  /** Upsert a single user preference key. Conflicts on `(userId, key)` update
   *  the stored value. */
  upsertUserPreference(
    userId: string,
    key: string,
    value: unknown,
  ): Promise<void>;
}
