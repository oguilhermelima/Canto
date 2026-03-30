import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { torrent } from "@canto/db/schema";

type TorrentRow = typeof torrent.$inferSelect;

export async function findTorrentById(db: Database, id: string) {
  return db.query.torrent.findFirst({
    where: eq(torrent.id, id),
  });
}

export async function findTorrentByHash(db: Database, hash: string) {
  return db.query.torrent.findFirst({
    where: eq(torrent.hash, hash),
  });
}

export async function findTorrentByTitle(db: Database, title: string) {
  return db.query.torrent.findFirst({
    where: eq(torrent.title, title),
  });
}

export async function findTorrentsByMediaId(db: Database, mediaId: string) {
  return db.query.torrent.findMany({
    where: eq(torrent.mediaId, mediaId),
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
  });
}

export async function findAllTorrents(db: Database) {
  return db.query.torrent.findMany({
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
  });
}

export async function findPendingImports(db: Database) {
  return db.query.torrent.findMany({
    where: eq(torrent.imported, false),
  });
}

export async function createTorrent(
  db: Database,
  data: typeof torrent.$inferInsert,
) {
  const [row] = await db.insert(torrent).values(data).returning();
  return row;
}

export async function updateTorrent(
  db: Database,
  id: string,
  data: Partial<typeof torrent.$inferInsert>,
) {
  const [updated] = await db
    .update(torrent)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(torrent.id, id))
    .returning();
  return updated;
}

export async function deleteTorrent(db: Database, id: string) {
  await db.delete(torrent).where(eq(torrent.id, id));
}

export async function updateTorrentBatch(
  db: Database,
  ids: string[],
  data: Partial<typeof torrent.$inferInsert>,
) {
  if (ids.length === 0) return;
  await db
    .update(torrent)
    .set({ ...data, updatedAt: new Date() })
    .where(inArray(torrent.id, ids));
}

export async function claimTorrentForImport(db: Database, id: string) {
  const [claimed] = await db
    .update(torrent)
    .set({ importing: true })
    .where(and(eq(torrent.id, id), eq(torrent.importing, false)))
    .returning();
  return claimed;
}
