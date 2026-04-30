export type ListId = string & { readonly __brand: "ListId" };

/** Discriminator for the list table. `server` is the singleton shared library
 *  populated by reconciliation; `watchlist` is the per-user system list created
 *  on onboarding; `custom` is everything the user creates by hand. */
export type ListType = "watchlist" | "custom" | "server";

/** Sharing surface for a list. `shared` collections expose write access to
 *  invited members; `public` is read-only on the public profile route. */
export type ListVisibility = "public" | "private" | "shared";

/** Sort key surfaced as the per-collection default. Mirrors the validator-
 *  defined `collectionDefaultSort` enum but kept as a string here so the
 *  domain doesn't have to re-narrow a value Drizzle already returns as `string`. */
export type CollectionDefaultSort = string;

export interface List {
  id: ListId;
  userId: string | null;
  name: string;
  slug: string;
  description: string | null;
  type: ListType;
  visibility: ListVisibility;
  isSystem: boolean;
  position: number;
  defaultSortBy: CollectionDefaultSort;
  groupByStatus: boolean;
  hideCompleted: boolean;
  hideDropped: boolean;
  showHidden: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Minimal projection used by tombstone-sweep on the worker — only the
 *  identity + tombstone marker. */
export interface ListTombstone {
  id: ListId;
  deletedAt: Date | null;
}

/** Projection used by the public profile + collection-layout views. Wraps a
 *  `List` with derived item count and up-to-4 preview poster paths. */
export interface ListWithCounts extends List {
  itemCount: number;
  previewPoster: string | null;
  previewPosters: string[];
}

/** Shape returned by lookups that need the list owner — name + avatar for
 *  shared-collection headers. */
export interface ListOwnerSummary {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface NewList {
  userId: string | null;
  name: string;
  slug: string;
  description?: string | null;
  type: ListType;
  visibility?: ListVisibility;
  isSystem?: boolean;
}

/** Partial update — fields the caller may patch on an existing list. Excludes
 *  identity (`id`, `userId`, `type`) and timestamps managed by the adapter. */
export interface UpdateListInput {
  name?: string;
  slug?: string;
  description?: string | null;
  position?: number;
  visibility?: ListVisibility;
  defaultSortBy?: CollectionDefaultSort;
  groupByStatus?: boolean;
  hideCompleted?: boolean;
  hideDropped?: boolean;
  showHidden?: boolean;
}
