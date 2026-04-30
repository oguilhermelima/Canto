import type {
  MediaFile,
  MediaFileId,
  MediaFileStatus,
  NewMediaFile,
  UpdateMediaFileInput,
} from "@canto/core/domain/torrents/types/media-file";
import type { mediaFile } from "@canto/db/schema";

type Row = typeof mediaFile.$inferSelect;
type Insert = typeof mediaFile.$inferInsert;

function toStatus(value: string): MediaFileStatus {
  return value === "imported" || value === "failed" ? value : "pending";
}

export function toDomain(row: Row): MediaFile {
  return {
    id: row.id as MediaFileId,
    mediaId: row.mediaId,
    episodeId: row.episodeId,
    downloadId: row.downloadId,
    filePath: row.filePath,
    quality: row.quality,
    source: row.source,
    status: toStatus(row.status),
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRow(input: NewMediaFile): Insert {
  return {
    mediaId: input.mediaId,
    episodeId: input.episodeId ?? null,
    downloadId: input.downloadId ?? null,
    filePath: input.filePath,
    quality: input.quality ?? null,
    source: input.source ?? null,
    ...(input.status !== undefined && { status: input.status }),
    sizeBytes: input.sizeBytes ?? null,
  };
}

export function toUpdateRow(input: UpdateMediaFileInput): Partial<Insert> {
  const out: Partial<Insert> = {};
  if (input.filePath !== undefined) out.filePath = input.filePath;
  if (input.quality !== undefined) out.quality = input.quality;
  if (input.source !== undefined) out.source = input.source;
  if (input.status !== undefined) out.status = input.status;
  if (input.sizeBytes !== undefined) out.sizeBytes = input.sizeBytes;
  return out;
}
