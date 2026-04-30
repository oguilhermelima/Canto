/** Branded id for the `download` table primary key. */
export type DownloadId = string & { readonly __brand: "DownloadId" };

/**
 * Possible status values written to `download.status`. Mirrors the union
 * the rest of the system narrows on (`"unknown"` is the column default
 * for rows seeded before status semantics existed).
 */
export type DownloadStatus =
  | "unknown"
  | "pending"
  | "downloading"
  | "completed"
  | "paused"
  | "stalled"
  | "incomplete"
  | "removed"
  | "error"
  | "failed"
  | "cancelled";

/** "movie" | "season" | "episode" — what the download row represents. */
export type DownloadKind = "movie" | "season" | "episode";

/**
 * Domain entity for a download row. Mirrors the schema 1:1 with branded
 * id; mappers handle the conversion at the infra boundary.
 */
export interface Download {
  id: DownloadId;
  mediaId: string | null;
  hash: string | null;
  title: string;
  downloadType: DownloadKind;
  seasonNumber: number | null;
  episodeNumbers: number[] | null;
  status: DownloadStatus;
  quality: string;
  source: string;
  progress: number;
  contentPath: string | null;
  fileSize: number | null;
  magnetUrl: string | null;
  downloadUrl: string | null;
  imported: boolean;
  importing: boolean;
  importAttempts: number;
  importMethod: string | null;
  usenet: boolean;
  repackCount: number;
  releaseGroup: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input shape for inserting a new download row. */
export interface NewDownload {
  mediaId?: string | null;
  hash?: string | null;
  title: string;
  downloadType?: DownloadKind;
  seasonNumber?: number | null;
  episodeNumbers?: number[] | null;
  status?: DownloadStatus;
  quality?: string;
  source?: string;
  progress?: number;
  contentPath?: string | null;
  fileSize?: number | null;
  magnetUrl?: string | null;
  downloadUrl?: string | null;
  imported?: boolean;
  importing?: boolean;
  importAttempts?: number;
  importMethod?: string | null;
  usenet?: boolean;
  repackCount?: number;
  releaseGroup?: string | null;
}

/** Patch shape for updating an existing download row. All fields optional. */
export interface UpdateDownloadInput {
  mediaId?: string | null;
  hash?: string | null;
  title?: string;
  downloadType?: DownloadKind;
  seasonNumber?: number | null;
  episodeNumbers?: number[] | null;
  status?: DownloadStatus;
  quality?: string;
  source?: string;
  progress?: number;
  contentPath?: string | null;
  fileSize?: number | null;
  magnetUrl?: string | null;
  downloadUrl?: string | null;
  imported?: boolean;
  importing?: boolean;
  importAttempts?: number;
  importMethod?: string | null;
  usenet?: boolean;
  repackCount?: number;
  releaseGroup?: string | null;
}
