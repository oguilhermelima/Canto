import type {
  downloadFolder,
  folderServerLink,
  folderMediaPath,
} from "@canto/db/schema";

type FolderRow = typeof downloadFolder.$inferSelect;
type FolderInsert = typeof downloadFolder.$inferInsert;
type ServerLinkRow = typeof folderServerLink.$inferSelect;
type ServerLinkInsert = typeof folderServerLink.$inferInsert;
type MediaPathRow = typeof folderMediaPath.$inferSelect;
type MediaPathInsert = typeof folderMediaPath.$inferInsert;

export interface FolderRepositoryPort {
  findFolderById(id: string): Promise<FolderRow | undefined>;
  findDefaultFolder(): Promise<FolderRow | undefined>;
  findAllFolders(): Promise<FolderRow[]>;
  findAllFoldersWithLinks(): Promise<Array<FolderRow & { mediaPaths: MediaPathRow[] }>>;
  createFolder(data: FolderInsert): Promise<FolderRow | undefined>;
  updateFolder(id: string, data: Partial<FolderInsert>): Promise<FolderRow | undefined>;
  deleteFolder(id: string): Promise<void>;
  setDefaultFolder(id: string): Promise<FolderRow | undefined>;
  seedDefaultFolders(): Promise<FolderRow[]>;

  // Server Links
  findServerLink(serverType: string, serverLibraryId: string): Promise<ServerLinkRow | undefined>;
  findEnabledSyncLinks(): Promise<ServerLinkRow[]>;
  upsertServerLink(data: ServerLinkInsert): Promise<ServerLinkRow | undefined>;
  updateServerLink(
    id: string,
    data: Partial<Pick<ServerLinkInsert, "syncEnabled" | "contentType" | "lastSyncedAt">>,
  ): Promise<ServerLinkRow | undefined>;
  removeServerLink(id: string): Promise<void>;
  findAllServerLinks(serverType?: string): Promise<ServerLinkRow[]>;

  // Media Paths
  findMediaPathsByFolder(folderId: string): Promise<MediaPathRow[]>;
  findAllMediaPaths(): Promise<MediaPathRow[]>;
  addMediaPath(data: MediaPathInsert): Promise<MediaPathRow | undefined>;
  removeMediaPath(id: string): Promise<void>;
}
