import type { listItem } from "@canto/db/schema";
import type {
  ListItem,
  ListItemId,
  MediaInListSummary,
  NewListItem,
} from "@canto/core/domain/lists/types/list-item";
import type { ListType } from "@canto/core/domain/lists/types/list";

type ListItemRow = typeof listItem.$inferSelect;
type ListItemInsert = typeof listItem.$inferInsert;

export function toDomain(row: ListItemRow): ListItem {
  return {
    id: row.id as ListItemId,
    listId: row.listId,
    mediaId: row.mediaId,
    addedAt: row.addedAt,
    position: row.position,
    notes: row.notes,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
    lastPushedAt: row.lastPushedAt,
  };
}

export function toRow(input: NewListItem): ListItemInsert {
  return {
    listId: input.listId,
    mediaId: input.mediaId,
    notes: input.notes ?? undefined,
  };
}

export function toMediaInListSummary(row: {
  listId: string;
  listName: string;
  listSlug: string;
  listType: string;
}): MediaInListSummary {
  return {
    listId: row.listId,
    listName: row.listName,
    listSlug: row.listSlug,
    listType: row.listType as ListType,
  };
}
