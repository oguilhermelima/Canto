import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { syncItem, syncEpisode } from "@canto/db/schema";

export async function findSyncItemById(db: Database, id: string) {
  return db.query.syncItem.findFirst({
    where: eq(syncItem.id, id),
  });
}

export async function findSyncItemsByMediaId(db: Database, mediaId: string) {
  return db
    .select({
      source: syncItem.source,
      jellyfinItemId: syncItem.jellyfinItemId,
      plexRatingKey: syncItem.plexRatingKey,
    })
    .from(syncItem)
    .where(eq(syncItem.mediaId, mediaId));
}

export interface SyncItemFilters {
  libraryId?: string;
  source?: string;
  result?: string;
}

export async function findSyncItemsPaginated(
  db: Database,
  filters: SyncItemFilters,
  limit: number,
  offset: number,
) {
  const conditions = [];
  if (filters.libraryId) conditions.push(eq(syncItem.libraryId, filters.libraryId));
  if (filters.source) conditions.push(eq(syncItem.source, filters.source));
  if (filters.result) conditions.push(eq(syncItem.result, filters.result));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [total]] = await Promise.all([
    db
      .select()
      .from(syncItem)
      .where(where)
      .orderBy(
        desc(eq(syncItem.result, "failed")),
        desc(eq(syncItem.result, "imported")),
        syncItem.serverItemTitle,
      )
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(syncItem).where(where),
  ]);
  return { items, total: total?.count ?? 0 };
}

export async function findSyncItemsWithEpisodes(db: Database, mediaId: string) {
  return db.query.syncItem.findMany({
    where: eq(syncItem.mediaId, mediaId),
    with: { episodes: true },
  });
}

export async function updateSyncItem(
  db: Database,
  id: string,
  data: Partial<typeof syncItem.$inferInsert>,
) {
  await db.update(syncItem).set(data).where(eq(syncItem.id, id));
}

export async function deleteSyncItemsByLibraryIds(db: Database, libraryIds: string[]) {
  if (libraryIds.length === 0) return;
  await db.delete(syncItem).where(inArray(syncItem.libraryId, libraryIds));
}

export async function createSyncItem(db: Database, data: typeof syncItem.$inferInsert) {
  const [row] = await db.insert(syncItem).values(data).returning();
  return row;
}

export async function createSyncEpisodes(db: Database, episodes: Array<typeof syncEpisode.$inferInsert>) {
  if (episodes.length === 0) return;
  await db.insert(syncEpisode).values(episodes);
}
