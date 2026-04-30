import type { ListType } from "@canto/core/domain/lists/types/list";

export type ListItemId = string & { readonly __brand: "ListItemId" };

/** Records who tombstoned a list item. Used for forensic queries on the
 *  per-item history (e.g. distinguishing a Trakt-sync deletion from a
 *  user-initiated remove). */
export type ListItemActor = "user" | "trakt-sync" | "move";

export interface ListItem {
  id: ListItemId;
  listId: string;
  mediaId: string;
  addedAt: Date;
  position: number;
  notes: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  lastPushedAt: Date | null;
}

export interface NewListItem {
  listId: string;
  mediaId: string;
  notes?: string | null;
}

/** Projection used by the "in N other collections" hint on collection cards
 *  — flattens listItem ⨝ list to the fields needed by the picker UI. */
export interface MediaInListSummary {
  listId: string;
  listName: string;
  listSlug: string;
  listType: ListType;
}
