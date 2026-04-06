import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { downloadFolder, folderServerLink, folderMediaPath, type RuleGroup } from "@canto/db/schema";

type FolderInsert = typeof downloadFolder.$inferInsert;
type FolderServerLinkInsert = typeof folderServerLink.$inferInsert;
type FolderMediaPathInsert = typeof folderMediaPath.$inferInsert;

// ── Folder CRUD ──

export async function findFolderById(db: Database, id: string) {
  return db.query.downloadFolder.findFirst({
    where: eq(downloadFolder.id, id),
  });
}

export async function findDefaultFolder(db: Database) {
  return db.query.downloadFolder.findFirst({
    where: eq(downloadFolder.isDefault, true),
  });
}

export async function findAllFolders(db: Database) {
  return db.query.downloadFolder.findMany({
    orderBy: (f, { asc }) => [asc(f.priority), asc(f.name)],
  });
}

export async function findAllFoldersWithLinks(db: Database) {
  return db.query.downloadFolder.findMany({
    orderBy: (f, { asc }) => [asc(f.priority), asc(f.name)],
    with: { serverLinks: true, mediaPaths: true },
  });
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
const DEFAULT_RULES: Record<string, { rules: RuleGroup; priority: number }> = {
  movies: {
    rules: { operator: "AND", conditions: [{ field: "type", op: "eq", value: "movie" }] },
    priority: 20,
  },
  shows: {
    rules: { operator: "AND", conditions: [{ field: "type", op: "eq", value: "show" }] },
    priority: 10,
  },
  animes: {
    rules: {
      operator: "AND",
      conditions: [
        { field: "type", op: "eq", value: "show" },
        {
          operator: "OR",
          conditions: [
            { field: "originCountry", op: "contains_any", value: ["JP"] },
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

export async function findServerLinksByFolder(db: Database, folderId: string) {
  return db.query.folderServerLink.findMany({
    where: eq(folderServerLink.folderId, folderId),
  });
}

export async function findServerLink(
  db: Database,
  serverType: string,
  serverLibraryId: string,
) {
  return db.query.folderServerLink.findFirst({
    where: and(
      eq(folderServerLink.serverType, serverType),
      eq(folderServerLink.serverLibraryId, serverLibraryId),
    ),
  });
}

export async function findEnabledSyncLinks(db: Database) {
  return db.query.folderServerLink.findMany({
    where: eq(folderServerLink.syncEnabled, true),
    with: { folder: true },
  });
}

export async function upsertServerLink(db: Database, data: FolderServerLinkInsert) {
  const [row] = await db
    .insert(folderServerLink)
    .values(data)
    .onConflictDoUpdate({
      target: [folderServerLink.serverType, folderServerLink.serverLibraryId],
      set: {
        folderId: data.folderId,
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
  data: Partial<Pick<FolderServerLinkInsert, "syncEnabled" | "contentType" | "lastSyncedAt" | "folderId">>,
) {
  const [updated] = await db
    .update(folderServerLink)
    .set(data)
    .where(eq(folderServerLink.id, id))
    .returning();
  return updated;
}

export async function removeServerLink(db: Database, id: string) {
  await db.delete(folderServerLink).where(eq(folderServerLink.id, id));
}

export async function findAllServerLinks(db: Database, serverType?: string) {
  if (serverType) {
    return db.query.folderServerLink.findMany({
      where: eq(folderServerLink.serverType, serverType),
      with: { folder: true },
    });
  }
  return db.query.folderServerLink.findMany({ with: { folder: true } });
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
