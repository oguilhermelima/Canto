import type { list } from "@canto/db/schema";
import type {
  List,
  ListId,
  ListOwnerSummary,
  ListTombstone,
  ListType,
  ListVisibility,
  NewList,
  UpdateListInput,
} from "@canto/core/domain/lists/types/list";

type ListRow = typeof list.$inferSelect;
type ListInsert = typeof list.$inferInsert;

export function toDomain(row: ListRow): List {
  return {
    id: row.id as ListId,
    userId: row.userId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    type: row.type as ListType,
    visibility: row.visibility as ListVisibility,
    isSystem: row.isSystem,
    position: row.position,
    defaultSortBy: row.defaultSortBy,
    groupByStatus: row.groupByStatus,
    hideCompleted: row.hideCompleted,
    hideDropped: row.hideDropped,
    showHidden: row.showHidden,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toTombstone(
  row: Pick<ListRow, "id" | "deletedAt">,
): ListTombstone {
  return {
    id: row.id as ListId,
    deletedAt: row.deletedAt,
  };
}

export function toOwnerSummary(
  row: Pick<{ id: string; name: string; email: string; image: string | null }, "id" | "name" | "email" | "image">,
): ListOwnerSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
  };
}

export function toRow(input: NewList): ListInsert {
  return {
    userId: input.userId,
    name: input.name,
    slug: input.slug,
    description: input.description ?? undefined,
    type: input.type,
    visibility: input.visibility,
    isSystem: input.isSystem,
  };
}

/** Translate the patch shape used by `update` calls into the partial Drizzle
 *  insert that the underlying repo accepts. Skips `undefined` so the SQL
 *  `SET` clause only touches fields the caller actually supplied. */
export function toUpdateRow(
  input: UpdateListInput,
): Partial<
  Pick<
    ListInsert,
    | "name"
    | "slug"
    | "description"
    | "position"
    | "visibility"
    | "defaultSortBy"
    | "groupByStatus"
    | "hideCompleted"
    | "hideDropped"
    | "showHidden"
  >
> {
  const out: Partial<
    Pick<
      ListInsert,
      | "name"
      | "slug"
      | "description"
      | "position"
      | "visibility"
      | "defaultSortBy"
      | "groupByStatus"
      | "hideCompleted"
      | "hideDropped"
      | "showHidden"
    >
  > = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.slug !== undefined) out.slug = input.slug;
  if (input.description !== undefined) out.description = input.description;
  if (input.position !== undefined) out.position = input.position;
  if (input.visibility !== undefined) out.visibility = input.visibility;
  if (input.defaultSortBy !== undefined) out.defaultSortBy = input.defaultSortBy;
  if (input.groupByStatus !== undefined) out.groupByStatus = input.groupByStatus;
  if (input.hideCompleted !== undefined) out.hideCompleted = input.hideCompleted;
  if (input.hideDropped !== undefined) out.hideDropped = input.hideDropped;
  if (input.showHidden !== undefined) out.showHidden = input.showHidden;
  return out;
}
