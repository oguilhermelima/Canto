import type {
  Folder,
  NewFolder,
  UpdateFolderInput,
} from "@canto/core/domain/file-organization/types/folder";
import type {
  FolderMediaPath,
  NewFolderMediaPath,
} from "@canto/core/domain/file-organization/types/folder-media-path";
import type {
  FolderServerLink,
  UpdateFolderServerLinkInput,
  UpsertFolderServerLinkInput,
} from "@canto/core/domain/file-organization/types/server-link";

/**
 * Single port covering folder/media-path/server-link bookkeeping. This
 * is what the routing layer + worker reverse-sync use; the actual
 * filesystem operations live behind {@link FileSystemPort} (already
 * defined under `domain/shared/ports`).
 */
export interface FoldersRepositoryPort {
  // ── Folder ──

  findFolderById(id: string): Promise<Folder | null>;
  findDefaultFolder(): Promise<Folder | null>;
  findAllFolders(): Promise<Folder[]>;
  findAllFoldersWithMediaPaths(): Promise<
    Array<Folder & { mediaPaths: FolderMediaPath[] }>
  >;

  createFolder(input: NewFolder): Promise<Folder>;
  updateFolder(id: string, input: UpdateFolderInput): Promise<Folder | null>;
  deleteFolder(id: string): Promise<void>;
  setDefaultFolder(id: string): Promise<Folder | null>;
  seedDefaultFolders(): Promise<Folder[]>;

  // ── Folder media paths ──

  findMediaPathsByFolder(folderId: string): Promise<FolderMediaPath[]>;
  findAllMediaPaths(): Promise<FolderMediaPath[]>;
  addMediaPath(input: NewFolderMediaPath): Promise<FolderMediaPath | null>;
  removeMediaPath(id: string): Promise<void>;

  // ── Server links ──

  findServerLinkById(id: string): Promise<FolderServerLink | null>;
  findServerLink(
    serverType: string,
    serverLibraryId: string,
    userConnectionId?: string,
  ): Promise<FolderServerLink | null>;
  findEnabledSyncLinks(
    userConnectionId?: string,
    serverType?: "jellyfin" | "plex",
  ): Promise<FolderServerLink[]>;
  findAllServerLinks(
    serverType?: string,
    userConnectionId?: string,
  ): Promise<FolderServerLink[]>;
  upsertServerLink(input: UpsertFolderServerLinkInput): Promise<FolderServerLink>;
  updateServerLink(
    id: string,
    input: UpdateFolderServerLinkInput,
  ): Promise<FolderServerLink | null>;
  updateServerLinksBatch(
    ids: string[],
    input: UpdateFolderServerLinkInput,
  ): Promise<void>;
  removeServerLink(id: string): Promise<void>;
}
