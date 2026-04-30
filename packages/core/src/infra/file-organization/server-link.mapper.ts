import type {
  FolderServerLink,
  FolderServerLinkId,
  UpdateFolderServerLinkInput,
  UpsertFolderServerLinkInput,
} from "@canto/core/domain/file-organization/types/server-link";
import type { folderServerLink } from "@canto/db/schema";

type Row = typeof folderServerLink.$inferSelect;
type Insert = typeof folderServerLink.$inferInsert;

export function toDomain(row: Row): FolderServerLink {
  return {
    id: row.id as FolderServerLinkId,
    userConnectionId: row.userConnectionId,
    serverType: row.serverType,
    serverLibraryId: row.serverLibraryId,
    serverLibraryName: row.serverLibraryName,
    serverPath: row.serverPath,
    syncEnabled: row.syncEnabled,
    contentType: row.contentType,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
  };
}

export function toRow(input: UpsertFolderServerLinkInput): Insert {
  return {
    userConnectionId: input.userConnectionId ?? null,
    serverType: input.serverType,
    serverLibraryId: input.serverLibraryId,
    serverLibraryName: input.serverLibraryName ?? null,
    serverPath: input.serverPath ?? null,
    ...(input.syncEnabled !== undefined && { syncEnabled: input.syncEnabled }),
    contentType: input.contentType ?? null,
  };
}

export function toUpdateRow(input: UpdateFolderServerLinkInput): Partial<Insert> {
  const out: Partial<Insert> = {};
  if (input.syncEnabled !== undefined) out.syncEnabled = input.syncEnabled;
  if (input.contentType !== undefined) out.contentType = input.contentType;
  if (input.lastSyncedAt !== undefined) out.lastSyncedAt = input.lastSyncedAt;
  return out;
}
