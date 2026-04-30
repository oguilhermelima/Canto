import type { Database } from "@canto/db/client";
import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import {
  addMediaPath,
  createFolder,
  deleteFolder,
  findAllFolders,
  findAllFoldersWithLinks,
  findAllMediaPaths,
  findAllServerLinks,
  findDefaultFolder,
  findEnabledSyncLinks,
  findFolderById,
  findMediaPathsByFolder,
  findServerLink,
  findServerLinkById,
  removeMediaPath,
  removeServerLink,
  seedDefaultFolders,
  setDefaultFolder,
  updateFolder,
  updateServerLink,
  updateServerLinksBatch,
  upsertServerLink,
} from "@canto/core/infra/file-organization/folder-repository";
import {
  toDomain as folderToDomain,
  toRow as folderToRow,
  toUpdateRow as folderToUpdateRow,
} from "@canto/core/infra/file-organization/folder.mapper";
import {
  toDomain as mediaPathToDomain,
  toRow as mediaPathToRow,
} from "@canto/core/infra/file-organization/folder-media-path.mapper";
import {
  toDomain as serverLinkToDomain,
  toRow as serverLinkToRow,
  toUpdateRow as serverLinkToUpdateRow,
} from "@canto/core/infra/file-organization/server-link.mapper";

export function makeFoldersRepository(db: Database): FoldersRepositoryPort {
  return {
    // ── Folder ──
    findFolderById: async (id) => {
      const row = await findFolderById(db, id);
      return row ? folderToDomain(row) : null;
    },
    findDefaultFolder: async () => {
      const row = await findDefaultFolder(db);
      return row ? folderToDomain(row) : null;
    },
    findAllFolders: async () => {
      const rows = await findAllFolders(db);
      return rows.map(folderToDomain);
    },
    findAllFoldersWithMediaPaths: async () => {
      const rows = await findAllFoldersWithLinks(db);
      return rows.map((row) => ({
        ...folderToDomain(row),
        mediaPaths: row.mediaPaths.map(mediaPathToDomain),
      }));
    },
    createFolder: async (input) => {
      const row = await createFolder(db, folderToRow(input));
      if (!row) throw new Error("createFolder returned no row");
      return folderToDomain(row);
    },
    updateFolder: async (id, input) => {
      const row = await updateFolder(db, id, folderToUpdateRow(input));
      return row ? folderToDomain(row) : null;
    },
    deleteFolder: (id) => deleteFolder(db, id),
    setDefaultFolder: async (id) => {
      const row = await setDefaultFolder(db, id);
      return row ? folderToDomain(row) : null;
    },
    seedDefaultFolders: async () => {
      const rows = await seedDefaultFolders(db);
      return rows.map(folderToDomain);
    },

    // ── Media paths ──
    findMediaPathsByFolder: async (folderId) => {
      const rows = await findMediaPathsByFolder(db, folderId);
      return rows.map(mediaPathToDomain);
    },
    findAllMediaPaths: async () => {
      const rows = await findAllMediaPaths(db);
      return rows.map(mediaPathToDomain);
    },
    addMediaPath: async (input) => {
      const row = await addMediaPath(db, mediaPathToRow(input));
      return row ? mediaPathToDomain(row) : null;
    },
    removeMediaPath: (id) => removeMediaPath(db, id),

    // ── Server links ──
    findServerLinkById: async (id) => {
      const row = await findServerLinkById(db, id);
      return row ? serverLinkToDomain(row) : null;
    },
    findServerLink: async (serverType, serverLibraryId, userConnectionId) => {
      const row = await findServerLink(db, serverType, serverLibraryId, userConnectionId);
      return row ? serverLinkToDomain(row) : null;
    },
    findEnabledSyncLinks: async (userConnectionId, serverType) => {
      const rows = await findEnabledSyncLinks(db, userConnectionId, serverType);
      return rows.map(serverLinkToDomain);
    },
    findAllServerLinks: async (serverType, userConnectionId) => {
      const rows = await findAllServerLinks(db, serverType, userConnectionId);
      return rows.map(serverLinkToDomain);
    },
    upsertServerLink: async (input) => {
      const row = await upsertServerLink(db, serverLinkToRow(input));
      if (!row) throw new Error("upsertServerLink returned no row");
      return serverLinkToDomain(row);
    },
    updateServerLink: async (id, input) => {
      const row = await updateServerLink(db, id, serverLinkToUpdateRow(input));
      return row ? serverLinkToDomain(row) : null;
    },
    updateServerLinksBatch: (ids, input) =>
      updateServerLinksBatch(db, ids, serverLinkToUpdateRow(input)),
    removeServerLink: (id) => removeServerLink(db, id),
  };
}
