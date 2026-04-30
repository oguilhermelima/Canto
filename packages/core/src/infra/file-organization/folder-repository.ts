import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  downloadFolder,
  folderServerLink,
  folderMediaPath,
  type PersistedFolderRules,
  type RoutingRules,
} from "@canto/db/schema";
import { normalizeFolderRules } from "../../domain/torrents/rules/folder-routing";

/** Converts legacy-shape `rules` into the canonical `RoutingRules` shape on read. */
function normalizeFolderRow<T extends { rules: PersistedFolderRules | null }>(
  row: T,
): Omit<T, "rules"> & { rules: RoutingRules | null } {
  return { ...row, rules: normalizeFolderRules(row.rules) };
}

type FolderInsert = typeof downloadFolder.$inferInsert;
type FolderServerLinkInsert = typeof folderServerLink.$inferInsert;
type FolderMediaPathInsert = typeof folderMediaPath.$inferInsert;

// ── Folder CRUD ──

export async function findFolderById(db: Database, id: string) {
  const row = await db.query.downloadFolder.findFirst({
    where: eq(downloadFolder.id, id),
  });
  return row ? normalizeFolderRow(row) : row;
}

export async function findDefaultFolder(db: Database) {
  const row = await db.query.downloadFolder.findFirst({
    where: eq(downloadFolder.isDefault, true),
  });
  return row ? normalizeFolderRow(row) : row;
}

export async function findAllFolders(db: Database) {
  const rows = await db.query.downloadFolder.findMany({
    orderBy: (f, { asc }) => [asc(f.priority), asc(f.name)],
  });
  return rows.map(normalizeFolderRow);
}

export async function findAllFoldersWithLinks(db: Database) {
  const rows = await db.query.downloadFolder.findMany({
    orderBy: (f, { asc }) => [asc(f.priority), asc(f.name)],
    with: { mediaPaths: true },
  });
  return rows.map(normalizeFolderRow);
}

export async function createFolder(db: Database, data: FolderInsert) {
  const [row] = await db.insert(downloadFolder).values(data).returning();
  return row;
}

export async function updateFolder(
  db: Database,
  id: string,
  data: Partial<FolderInsert>,
) {
  const [updated] = await db
    .update(downloadFolder)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(downloadFolder.id, id))
    .returning();
  return updated;
}

export async function deleteFolder(db: Database, id: string) {
  await db.delete(downloadFolder).where(eq(downloadFolder.id, id));
}

export async function setDefaultFolder(db: Database, id: string) {
  // Unset all defaults
  await db
    .update(downloadFolder)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(eq(downloadFolder.isDefault, true));

  // Set new default
  const [updated] = await db
    .update(downloadFolder)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(eq(downloadFolder.id, id))
    .returning();
  return updated;
}

/** Default rules for common folder types */
const DEFAULT_RULES: Record<string, { rules: RoutingRules; priority: number }> = {
  movies: {
    rules: {
      rules: [{ include: [{ field: "type", op: "eq", value: "movie" }] }],
    },
    priority: 20,
  },
  shows: {
    rules: {
      rules: [{ include: [{ field: "type", op: "eq", value: "show" }] }],
    },
    priority: 10,
  },
  // "Shows AND (JP OR Animation)" expands to two rules under the new OR-of-rules model.
  animes: {
    rules: {
      rules: [
        {
          include: [
            { field: "type", op: "eq", value: "show" },
            { field: "originCountry", op: "contains_any", value: ["JP"] },
          ],
        },
        {
          include: [
            { field: "type", op: "eq", value: "show" },
            { field: "genre", op: "contains_any", value: ["Animation"] },
          ],
        },
      ],
    },
    priority: 0,
  },
};

export async function seedDefaultFolders(db: Database) {
  const existing = await db.query.downloadFolder.findMany();
  if (existing.length > 0) return existing;

  return db
    .insert(downloadFolder)
    .values([
      { name: "Anime", qbitCategory: "animes", ...DEFAULT_RULES.animes, isDefault: false },
      { name: "Shows", qbitCategory: "shows", ...DEFAULT_RULES.shows, isDefault: false },
      { name: "Movies", qbitCategory: "movies", ...DEFAULT_RULES.movies, isDefault: true },
    ])
    .returning();
}

// ── Server Links ──

export async function findServerLink(
  db: Database,
  serverType: string,
  serverLibraryId: string,
  userConnectionId?: string,
) {
  return db.query.folderServerLink.findFirst({
    where: and(
      eq(folderServerLink.serverType, serverType),
      eq(folderServerLink.serverLibraryId, serverLibraryId),
      userConnectionId ? eq(folderServerLink.userConnectionId, userConnectionId) : isNull(folderServerLink.userConnectionId),
    ),
  });
}

export async function findServerLinkById(db: Database, id: string) {
  return db.query.folderServerLink.findFirst({
    where: eq(folderServerLink.id, id),
  });
}

export async function findEnabledSyncLinks(
  db: Database,
  userConnectionId?: string,
  serverType?: "jellyfin" | "plex",
) {
  return db.query.folderServerLink.findMany({
    where: and(
      eq(folderServerLink.syncEnabled, true),
      userConnectionId ? eq(folderServerLink.userConnectionId, userConnectionId) : undefined,
      serverType ? eq(folderServerLink.serverType, serverType) : undefined,
    ),
  });
}

export async function upsertServerLink(db: Database, data: FolderServerLinkInsert) {
  const [row] = await db
    .insert(folderServerLink)
    .values(data)
    .onConflictDoUpdate({
      target: [folderServerLink.serverType, folderServerLink.serverLibraryId, folderServerLink.userConnectionId],
      set: {
        serverLibraryName: data.serverLibraryName,
        serverPath: data.serverPath,
        contentType: data.contentType,
      },
    })
    .returning();
  return row;
}

export async function updateServerLink(
  db: Database,
  id: string,
  data: Partial<Pick<FolderServerLinkInsert, "syncEnabled" | "contentType" | "lastSyncedAt">>,
) {
  const [updated] = await db
    .update(folderServerLink)
    .set(data)
    .where(eq(folderServerLink.id, id))
    .returning();
  return updated;
}

/**
 * Apply the same `data` update to every link id in `ids`. Mirrors
 * `updateDownloadBatch`; used by reverse-sync to checkpoint dozens of links
 * at once without the per-row round-trip of calling `updateServerLink` in a
 * loop.
 */
export async function updateServerLinksBatch(
  db: Database,
  ids: string[],
  data: Partial<Pick<FolderServerLinkInsert, "syncEnabled" | "contentType" | "lastSyncedAt">>,
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(folderServerLink)
    .set(data)
    .where(inArray(folderServerLink.id, ids));
}

export async function removeServerLink(db: Database, id: string) {
  await db.delete(folderServerLink).where(eq(folderServerLink.id, id));
}

export async function findAllServerLinks(db: Database, serverType?: string, userConnectionId?: string) {
  const conditions = [];
  if (serverType) conditions.push(eq(folderServerLink.serverType, serverType));
  if (userConnectionId) conditions.push(eq(folderServerLink.userConnectionId, userConnectionId));

  return db.query.folderServerLink.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
  });
}

// ── Media Paths ──

export async function findMediaPathsByFolder(db: Database, folderId: string) {
  return db.query.folderMediaPath.findMany({
    where: eq(folderMediaPath.folderId, folderId),
  });
}

export async function findAllMediaPaths(db: Database) {
  return db.query.folderMediaPath.findMany();
}

export async function addMediaPath(db: Database, data: FolderMediaPathInsert) {
  const [row] = await db
    .insert(folderMediaPath)
    .values(data)
    .onConflictDoNothing({
      target: [folderMediaPath.folderId, folderMediaPath.path],
    })
    .returning();
  return row;
}

export async function removeMediaPath(db: Database, id: string) {
  await db.delete(folderMediaPath).where(eq(folderMediaPath.id, id));
}
