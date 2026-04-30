import type {
  FolderMediaPath,
  FolderMediaPathId,
  NewFolderMediaPath,
} from "@canto/core/domain/file-organization/types/folder-media-path";
import type { folderMediaPath } from "@canto/db/schema";

type Row = typeof folderMediaPath.$inferSelect;
type Insert = typeof folderMediaPath.$inferInsert;

export function toDomain(row: Row): FolderMediaPath {
  return {
    id: row.id as FolderMediaPathId,
    folderId: row.folderId,
    path: row.path,
    label: row.label,
    source: row.source,
    createdAt: row.createdAt,
  };
}

export function toRow(input: NewFolderMediaPath): Insert {
  return {
    folderId: input.folderId,
    path: input.path,
    label: input.label ?? null,
    source: input.source ?? null,
  };
}
