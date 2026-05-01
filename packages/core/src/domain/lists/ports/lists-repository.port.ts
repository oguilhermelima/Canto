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
  ListItemSyncRow,
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
  /** Live custom lists for a user. Used by Trakt sync to walk locally-owned
   *  custom collections and decide which ones to mirror to the remote. */
  findUserCustomLists(userId: string): Promise<List[]>;
  /** Tombstoned list ids for a user — set used by Trakt sync to skip rows
   *  awaiting deletion via the trakt-list-delete worker. */
  findUserTombstonedListIds(userId: string): Promise<string[]>;
  /** Live list of a specific type owned by a user (e.g. the user's
   *  watchlist). */
  findUserListByType(
    userId: string,
    type: "watchlist" | "custom" | "server",
  ): Promise<List | null>;
  ensureServerLibrary(): Promise<List>;
  /** Idempotent reconciliation pass: ensures the shared "Server library" list
   *  contains exactly the media currently observed on connected servers.
   *  `tag` is logged for diagnostics. */
  reconcileServerLibrary(tag: string): Promise<void>;
  create(input: NewList): Promise<List>;
  update(id: string, input: UpdateListInput): Promise<List | undefined>;
  softDelete(id: string): Promise<void>;
  hardDelete(id: string): Promise<void>;
  reorder(userId: string, orderedIds: string[]): Promise<void>;

  // ── Aggregating reads ──

  /**
   * `(externalId, provider)` pairs for all media in the user's lists
   * (watchlist + custom, excluding the server library). Used by the
   * recommendations exclusion set builder.
   */
  findUserListExternalIds(
    userId: string,
  ): Promise<Array<{ externalId: number; provider: string }>>;

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
  /** Stamp `last_pushed_at` on the listed media ids — the positive signal
   *  the Trakt sync uses to distinguish "never reached Trakt" from "reached
   *  Trakt and was later removed there". Skips tombstoned rows. */
  markItemsPushed(
    listId: string,
    mediaIds: string[],
    pushedAt: Date,
  ): Promise<void>;
  findMediaInLists(
    mediaId: string,
    userId: string,
  ): Promise<MediaInListSummary[]>;
  /** All list_item rows (live + tombstones) for a list, joined with media
   *  identifiers. Used by Trakt list-membership sync. */
  findItemsForSync(listId: string): Promise<ListItemSyncRow[]>;

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

  /** Aggregated ratings (sum + count) from the list owner and all members
   *  for the given media ids. Powers the per-item "members rating" badge in
   *  shared list views. Returns one row per media id that has at least one
   *  rating; missing ids should be treated as zero votes by the caller. */
  listMemberVotes(
    listId: string,
    mediaIds: string[],
  ): Promise<Array<{ mediaId: string; totalRating: number; voteCount: number }>>;

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

  // ── Transaction boundary ──

  /**
   * Run `fn` inside a database transaction with a tx-scoped clone of this
   * port. Use when a read-then-write sequence must be atomic (e.g. accept
   * invitation: read pending invite → flip status → insert membership row).
   * The returned port mirrors this one but every call goes through the open
   * transaction; on `fn` throw the whole sequence rolls back.
   */
  withTransaction<T>(
    fn: (tx: ListsRepositoryPort) => Promise<T>,
  ): Promise<T>;
}
