import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { download } from "@canto/db/schema";

export type DownloadRow = typeof download.$inferSelect;

export async function findDownloadById(db: Database, id: string) {
  return db.query.download.findFirst({
    where: eq(download.id, id),
  });
}

export async function findDownloadByHash(db: Database, hash: string) {
  return db.query.download.findFirst({
    where: eq(download.hash, hash),
  });
}

export async function findDownloadsByHashes(db: Database, hashes: string[]) {
  if (hashes.length === 0) return [];
  return db.query.download.findMany({
    where: inArray(download.hash, hashes),
  });
}

export async function findDownloadsByStatus(
  db: Database,
  status: typeof download.$inferSelect.status,
) {
  return db.query.download.findMany({
    where: eq(download.status, status),
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
  });
}

export async function findDownloadByTitle(db: Database, title: string) {
  return db.query.download.findFirst({
    where: eq(download.title, title),
  });
}

export async function findDownloadsByMediaId(db: Database, mediaId: string) {
  return db.query.download.findMany({
    where: eq(download.mediaId, mediaId),
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
  });
}

export async function findAllDownloads(db: Database) {
  return db.query.download.findMany({
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
  });
}

export async function findAllDownloadsPaginated(db: Database, limit: number, offset: number) {
  return db.query.download.findMany({
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
    limit,
    offset,
  });
}

export async function countAllDownloads(db: Database): Promise<number> {
  const [result] = await db.select({ count: sql<number>`count(*)` }).from(download);
  return Number(result?.count ?? 0);
}

export async function createDownload(
  db: Database,
  data: typeof download.$inferInsert,
) {
  const [row] = await db.insert(download).values(data).returning();
  return row;
}

export async function updateDownload(
  db: Database,
  id: string,
  data: Partial<typeof download.$inferInsert>,
) {
  const [updated] = await db
    .update(download)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(download.id, id))
    .returning();
  return updated;
}

export async function deleteDownload(db: Database, id: string) {
  await db.delete(download).where(eq(download.id, id));
}

export async function updateDownloadBatch(
  db: Database,
  ids: string[],
  data: Partial<typeof download.$inferInsert>,
) {
  if (ids.length === 0) return;
  await db
    .update(download)
    .set({ ...data, updatedAt: new Date() })
    .where(inArray(download.id, ids));
}

export async function claimDownloadForImport(db: Database, id: string) {
  const [claimed] = await db
    .update(download)
    .set({ importing: true })
    .where(and(eq(download.id, id), eq(download.importing, false)))
    .returning();
  return claimed;
}

export async function resetStaleImports(db: Database) {
  const result = await db
    .update(download)
    .set({ importing: false, updatedAt: new Date() })
    .where(
      and(
        eq(download.importing, true),
        lt(download.updatedAt, sql`NOW() - INTERVAL '30 minutes'`),
      ),
    )
    .returning({ id: download.id });
  if (result.length > 0) {
    console.log(`[import-torrents] Reset ${result.length} stale importing download(s)`);
  }
}

export async function findRecentImportedDownloads(
  db: Database,
  since: Date,
  limit: number,
) {
  return db.query.download.findMany({
    where: and(eq(download.imported, true), gt(download.createdAt, since)),
    orderBy: [desc(download.createdAt)],
    limit,
  });
}

export async function findUnimportedDownloads(db: Database) {
  return db.query.download.findMany({
    where: and(
      eq(download.imported, false),
      eq(download.importing, false),
      // Max 5 retries before giving up on stuck downloads.
      lt(download.importAttempts, 5),
      // First attempt (importAttempts === 0) is always eligible.
      // Subsequent attempts use linear backoff: 10min * importAttempts.
      or(
        eq(download.importAttempts, 0),
        lt(
          download.updatedAt,
          sql`NOW() - INTERVAL '10 minutes' * ${download.importAttempts}`,
        ),
      ),
    ),
  });
}
