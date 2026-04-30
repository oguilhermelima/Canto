/** Branded id for the `folder_media_path` table. */
export type FolderMediaPathId = string & { readonly __brand: "FolderMediaPathId" };

/**
 * One physical filesystem path that belongs to a folder. The same folder
 * may have multiple media paths (e.g. `/media/movies` plus an external
 * NAS mount); each is stored as its own row.
 */
export interface FolderMediaPath {
  id: FolderMediaPathId;
  folderId: string;
  path: string;
  label: string | null;
  source: string | null;
  createdAt: Date;
}

export interface NewFolderMediaPath {
  folderId: string;
  path: string;
  label?: string | null;
  source?: string | null;
}
