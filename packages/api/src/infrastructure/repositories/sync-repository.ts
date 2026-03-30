import { and, count, desc, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { syncItem, syncEpisode } from "@canto/db/schema";
import type { SQL } from "drizzle-orm";

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

export async function listSyncItems(
  db: Database,
  where: SQL | undefined,
  limit: number,
  offset: number,
) {
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
