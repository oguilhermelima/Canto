import type { Database } from "@canto/db/client";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import {
  countAllDownloads,
  createDownload,
  claimDownloadForImport,
  deleteDownload,
  findAllDownloads,
  findAllDownloadsPaginated,
  findDownloadById,
  findDownloadByHash,
  findDownloadByTitle,
  findDownloadsByHashes,
  findDownloadsByMediaId,
  findRecentImportedDownloads,
  findUnimportedDownloads,
  resetStaleImports,
  updateDownload,
  updateDownloadBatch,
} from "@canto/core/infra/torrents/download-repository";
import {
  toDomain as downloadToDomain,
  toRow as downloadToRow,
  toUpdateRow as downloadToUpdateRow,
} from "@canto/core/infra/torrents/download.mapper";
import {
  createMediaFile,
  createMediaFileNoConflict,
  deleteMediaFile,
  deleteMediaFilesByDownloadId,
  deletePendingMediaFilesByDownloadId,
  findDuplicateEpisodeFile,
  findDuplicateMovieFile,
  findMediaFilesByDownloadId,
  updateMediaFile,
} from "@canto/core/infra/media/media-file-repository";
import {
  toDomain as mediaFileToDomain,
  toRow as mediaFileToRow,
  toUpdateRow as mediaFileToUpdateRow,
} from "@canto/core/infra/torrents/media-file.mapper";
import {
  createBlocklistEntry,
  findBlocklistByMediaId,
  findBlocklistEntry,
} from "@canto/core/infra/content-enrichment/extras-repository";
import {
  toDomain as blocklistToDomain,
  toRow as blocklistToRow,
} from "@canto/core/infra/torrents/blocklist.mapper";

export function makeTorrentsRepository(db: Database): TorrentsRepositoryPort {
  return {
    // ── Download ──
    findDownloadById: async (id) => {
      const row = await findDownloadById(db, id);
      return row ? downloadToDomain(row) : null;
    },
    findDownloadByHash: async (hash) => {
      const row = await findDownloadByHash(db, hash);
      return row ? downloadToDomain(row) : null;
    },
    findDownloadsByHashes: async (hashes) => {
      const rows = await findDownloadsByHashes(db, hashes);
      return rows.map(downloadToDomain);
    },
    findDownloadByTitle: async (title) => {
      const row = await findDownloadByTitle(db, title);
      return row ? downloadToDomain(row) : null;
    },
    findDownloadsByMediaId: async (mediaId) => {
      const rows = await findDownloadsByMediaId(db, mediaId);
      return rows.map(downloadToDomain);
    },
    findAllDownloads: async () => {
      const rows = await findAllDownloads(db);
      return rows.map(downloadToDomain);
    },
    findAllDownloadsPaginated: async (limit, offset) => {
      const rows = await findAllDownloadsPaginated(db, limit, offset);
      return rows.map(downloadToDomain);
    },
    countAllDownloads: () => countAllDownloads(db),
    findRecentImportedDownloads: async (since, limit) => {
      const rows = await findRecentImportedDownloads(db, since, limit);
      return rows.map(downloadToDomain);
    },
    findUnimportedDownloads: async () => {
      const rows = await findUnimportedDownloads(db);
      return rows.map(downloadToDomain);
    },
    createDownload: async (input) => {
      const row = await createDownload(db, downloadToRow(input));
      if (!row) throw new Error("createDownload returned no row");
      return downloadToDomain(row);
    },
    updateDownload: async (id, input) => {
      const row = await updateDownload(db, id, downloadToUpdateRow(input));
      return row ? downloadToDomain(row) : null;
    },
    updateDownloadBatch: (ids, input) =>
      updateDownloadBatch(db, ids, downloadToUpdateRow(input)),
    deleteDownload: (id) => deleteDownload(db, id),
    claimDownloadForImport: async (id) => {
      const row = await claimDownloadForImport(db, id);
      return row ? downloadToDomain(row) : null;
    },
    resetStaleImports: () => resetStaleImports(db),

    // ── Media File ──
    findMediaFilesByDownloadId: async (downloadId, status) => {
      const rows = await findMediaFilesByDownloadId(db, downloadId, status);
      return rows.map(mediaFileToDomain);
    },
    findDuplicateMovieFile: async (mediaId, quality, source) => {
      const row = await findDuplicateMovieFile(db, mediaId, quality, source);
      return row ? mediaFileToDomain(row) : null;
    },
    findDuplicateEpisodeFile: async (episodeId, quality, source) => {
      const row = await findDuplicateEpisodeFile(db, episodeId, quality, source);
      return row ? mediaFileToDomain(row) : null;
    },
    createMediaFile: async (input) => {
      const row = await createMediaFile(db, mediaFileToRow(input));
      if (!row) throw new Error("createMediaFile returned no row");
      return mediaFileToDomain(row);
    },
    createMediaFileNoConflict: async (input) => {
      await createMediaFileNoConflict(db, mediaFileToRow(input));
    },
    updateMediaFile: async (id, input) => {
      const row = await updateMediaFile(db, id, mediaFileToUpdateRow(input));
      return row ? mediaFileToDomain(row) : null;
    },
    deleteMediaFile: (id) => deleteMediaFile(db, id),
    deleteMediaFilesByDownloadId: (downloadId) =>
      deleteMediaFilesByDownloadId(db, downloadId),
    deletePendingMediaFilesByDownloadId: (downloadId) =>
      deletePendingMediaFilesByDownloadId(db, downloadId),

    // ── Blocklist ──
    findBlocklistByMediaId: (mediaId) => findBlocklistByMediaId(db, mediaId),
    findBlocklistEntry: async (mediaId, title) => {
      const row = await findBlocklistEntry(db, mediaId, title);
      return row ? blocklistToDomain(row) : null;
    },
    createBlocklistEntry: async (input) => {
      const row = await createBlocklistEntry(db, blocklistToRow(input));
      if (!row) throw new Error("createBlocklistEntry returned no row");
      return blocklistToDomain(row);
    },
  };
}
