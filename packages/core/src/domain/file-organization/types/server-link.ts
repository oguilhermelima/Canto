/** Branded id for the `folder_server_link` table. */
export type FolderServerLinkId = string & { readonly __brand: "FolderServerLinkId" };

/**
 * A bridge row that connects a `download_folder` (admin-defined library)
 * to a Jellyfin folder or Plex section. Reverse-sync uses this to know
 * which on-server library to pull from for which local folder.
 */
export interface FolderServerLink {
  id: FolderServerLinkId;
  userConnectionId: string | null;
  serverType: string;
  serverLibraryId: string;
  serverLibraryName: string | null;
  serverPath: string | null;
  syncEnabled: boolean;
  contentType: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
}

export interface UpsertFolderServerLinkInput {
  userConnectionId?: string | null;
  serverType: string;
  serverLibraryId: string;
  serverLibraryName?: string | null;
  serverPath?: string | null;
  syncEnabled?: boolean;
  contentType?: string | null;
}

export interface UpdateFolderServerLinkInput {
  syncEnabled?: boolean;
  contentType?: string | null;
  lastSyncedAt?: Date | null;
}
