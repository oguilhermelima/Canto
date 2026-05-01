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

/**
 * `MediaFile` row with the joined episode + download projections used by the
 * file-organization rename flow. Episode is null for movie files; download
 * is null when the row was inserted by a manual import path.
 */
export interface MediaFileWithDetails extends MediaFile {
  episode: {
    id: string;
    number: number;
    title: string | null;
    seasonId: string;
    season: { id: string; number: number };
  } | null;
  download: {
    id: string;
    quality: string;
    source: string;
    title: string;
  } | null;
}
