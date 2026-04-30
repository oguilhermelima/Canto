/** Branded id for the `media_file` table. */
export type MediaFileId = string & { readonly __brand: "MediaFileId" };

/**
 * `media_file.status` values. `pending` is the placeholder state written
 * at download-time; `imported` flips when auto-import succeeds; `failed`
 * is reserved for retry-exhausted rows.
 */
export type MediaFileStatus = "pending" | "imported" | "failed";

export interface MediaFile {
  id: MediaFileId;
  mediaId: string;
  episodeId: string | null;
  downloadId: string | null;
  filePath: string;
  quality: string | null;
  source: string | null;
  status: MediaFileStatus;
  sizeBytes: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewMediaFile {
  mediaId: string;
  episodeId?: string | null;
  downloadId?: string | null;
  filePath: string;
  quality?: string | null;
  source?: string | null;
  status?: MediaFileStatus;
  sizeBytes?: number | null;
}

export interface UpdateMediaFileInput {
  filePath?: string;
  quality?: string | null;
  source?: string | null;
  status?: MediaFileStatus;
  sizeBytes?: number | null;
}
