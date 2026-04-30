import type {
  Download,
  DownloadId,
  DownloadKind,
  DownloadStatus,
  NewDownload,
  UpdateDownloadInput,
} from "@canto/core/domain/torrents/types/download";
import type { download } from "@canto/db/schema";

type Row = typeof download.$inferSelect;
type Insert = typeof download.$inferInsert;

function toStatus(value: string): DownloadStatus {
  return value as DownloadStatus;
}

function toKind(value: string): DownloadKind {
  return value === "season" || value === "episode" ? value : "movie";
}

export function toDomain(row: Row): Download {
  return {
    id: row.id as DownloadId,
    mediaId: row.mediaId,
    hash: row.hash,
    title: row.title,
    downloadType: toKind(row.downloadType),
    seasonNumber: row.seasonNumber,
    episodeNumbers: row.episodeNumbers,
    status: toStatus(row.status),
    quality: row.quality,
    source: row.source,
    progress: row.progress,
    contentPath: row.contentPath,
    fileSize: row.fileSize,
    magnetUrl: row.magnetUrl,
    downloadUrl: row.downloadUrl,
    imported: row.imported,
    importing: row.importing,
    importAttempts: row.importAttempts,
    importMethod: row.importMethod,
    usenet: row.usenet,
    repackCount: row.repackCount,
    releaseGroup: row.releaseGroup,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRow(input: NewDownload): Insert {
  return {
    mediaId: input.mediaId ?? null,
    hash: input.hash ?? null,
    title: input.title,
    ...(input.downloadType !== undefined && { downloadType: input.downloadType }),
    seasonNumber: input.seasonNumber ?? null,
    episodeNumbers: input.episodeNumbers ?? null,
    ...(input.status !== undefined && { status: input.status }),
    ...(input.quality !== undefined && { quality: input.quality }),
    ...(input.source !== undefined && { source: input.source }),
    ...(input.progress !== undefined && { progress: input.progress }),
    contentPath: input.contentPath ?? null,
    fileSize: input.fileSize ?? null,
    magnetUrl: input.magnetUrl ?? null,
    downloadUrl: input.downloadUrl ?? null,
    ...(input.imported !== undefined && { imported: input.imported }),
    ...(input.importing !== undefined && { importing: input.importing }),
    ...(input.importAttempts !== undefined && { importAttempts: input.importAttempts }),
    importMethod: input.importMethod ?? null,
    ...(input.usenet !== undefined && { usenet: input.usenet }),
    ...(input.repackCount !== undefined && { repackCount: input.repackCount }),
    releaseGroup: input.releaseGroup ?? null,
  };
}

export function toUpdateRow(input: UpdateDownloadInput): Partial<Insert> {
  const out: Partial<Insert> = {};
  if (input.mediaId !== undefined) out.mediaId = input.mediaId;
  if (input.hash !== undefined) out.hash = input.hash;
  if (input.title !== undefined) out.title = input.title;
  if (input.downloadType !== undefined) out.downloadType = input.downloadType;
  if (input.seasonNumber !== undefined) out.seasonNumber = input.seasonNumber;
  if (input.episodeNumbers !== undefined) out.episodeNumbers = input.episodeNumbers;
  if (input.status !== undefined) out.status = input.status;
  if (input.quality !== undefined) out.quality = input.quality;
  if (input.source !== undefined) out.source = input.source;
  if (input.progress !== undefined) out.progress = input.progress;
  if (input.contentPath !== undefined) out.contentPath = input.contentPath;
  if (input.fileSize !== undefined) out.fileSize = input.fileSize;
  if (input.magnetUrl !== undefined) out.magnetUrl = input.magnetUrl;
  if (input.downloadUrl !== undefined) out.downloadUrl = input.downloadUrl;
  if (input.imported !== undefined) out.imported = input.imported;
  if (input.importing !== undefined) out.importing = input.importing;
  if (input.importAttempts !== undefined) out.importAttempts = input.importAttempts;
  if (input.importMethod !== undefined) out.importMethod = input.importMethod;
  if (input.usenet !== undefined) out.usenet = input.usenet;
  if (input.repackCount !== undefined) out.repackCount = input.repackCount;
  if (input.releaseGroup !== undefined) out.releaseGroup = input.releaseGroup;
  return out;
}
