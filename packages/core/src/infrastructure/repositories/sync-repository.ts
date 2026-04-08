import { and, count, desc, eq, getTableColumns, inArray, lt } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { syncItem, syncEpisode, media } from "@canto/db/schema";

export async function findSyncItemById(db: Database, id: string) {
  return db.query.syncItem.findFirst({
    where: eq(syncItem.id, id),
  });
}

export async function findSyncItemsByMediaId(db: Database, mediaId: string) {
  return db
    .select({
      id: syncItem.id,
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
      .select({
        ...getTableColumns(syncItem),
        mediaPosterPath: media.posterPath,
        mediaTitle: media.title,
        mediaType: media.type,
        mediaYear: media.year,
        mediaExternalId: media.externalId,
      })
      .from(syncItem)
      .leftJoin(media, eq(syncItem.mediaId, media.id))
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

export async function deleteSyncItemsByLibraryIds(db: Database, libraryIds: string[], source?: string) {
  if (libraryIds.length === 0) return;
  if (source) {
    await db.delete(syncItem).where(and(inArray(syncItem.libraryId, libraryIds), eq(syncItem.source, source)));
  } else {
    await db.delete(syncItem).where(inArray(syncItem.libraryId, libraryIds));
  }
}

export async function createSyncItem(db: Database, data: typeof syncItem.$inferInsert) {
  const [row] = await db.insert(syncItem).values(data).returning();
  return row;
}

export async function createSyncEpisodes(db: Database, episodes: Array<typeof syncEpisode.$inferInsert>) {
  if (episodes.length === 0) return;
  await db.insert(syncEpisode).values(episodes);
}

export async function findSyncItemByServerKey(
  db: Database,
  source: string,
  libraryId: string | null | undefined,
  jellyfinItemId?: string,
  plexRatingKey?: string,
  serverLinkId?: string,
) {
  const conditions = [
    eq(syncItem.source, source),
  ];
  if (libraryId) conditions.push(eq(syncItem.libraryId, libraryId));
  if (serverLinkId) conditions.push(eq(syncItem.serverLinkId, serverLinkId));
  if (jellyfinItemId) conditions.push(eq(syncItem.jellyfinItemId, jellyfinItemId));
  if (plexRatingKey) conditions.push(eq(syncItem.plexRatingKey, plexRatingKey));

  return db.query.syncItem.findFirst({
    where: and(...conditions),
  });
}

export async function upsertSyncItemByServerKey(
  db: Database,
  data: typeof syncItem.$inferInsert,
) {
  const existing = await findSyncItemByServerKey(
    db,
    data.source!,
    data.libraryId,
    data.jellyfinItemId ?? undefined,
    data.plexRatingKey ?? undefined,
    data.serverLinkId ?? undefined,
  );

  if (existing) {
    // Protect resolved items: if already linked to a media with a different tmdbId,
    // only update server-side metadata (title/path/year) but preserve the match.
    const isAlreadyResolved = !!existing.mediaId;
    const incomingDiffers = isAlreadyResolved && data.tmdbId !== existing.tmdbId;

    await db
      .update(syncItem)
      .set({
        serverItemTitle: data.serverItemTitle,
        serverItemPath: data.serverItemPath,
        serverItemYear: data.serverItemYear,
        ...(incomingDiffers
          ? {} // preserve existing tmdbId, mediaId, result, reason
          : { tmdbId: data.tmdbId, mediaId: data.mediaId, result: data.result, reason: data.reason }),
        syncedAt: data.syncedAt,
        serverLinkId: data.serverLinkId,
      })
      .where(eq(syncItem.id, existing.id));
    return existing;
  }

  const [row] = await db.insert(syncItem).values(data).returning();
  return row;
}

export async function pruneOldSyncItems(
  db: Database,
  libraryIds: string[],
  source: string,
  cutoffDate: Date,
  serverLinkIds?: string[],
) {
  const sourceCondition = eq(syncItem.source, source);
  const cutoffCondition = lt(syncItem.syncedAt, cutoffDate);

  // Prune by libraryIds (legacy path)
  if (libraryIds.length > 0) {
    await db
      .delete(syncItem)
      .where(
        and(
          inArray(syncItem.libraryId, libraryIds),
          sourceCondition,
          cutoffCondition,
        ),
      );
  }

  // Prune by serverLinkIds (new path, for unlinked links with no folder)
  if (serverLinkIds && serverLinkIds.length > 0) {
    await db
      .delete(syncItem)
      .where(
        and(
          inArray(syncItem.serverLinkId, serverLinkIds),
          sourceCondition,
          cutoffCondition,
        ),
      );
  }
}

export async function deleteSyncEpisodesBySyncItemId(db: Database, syncItemId: string) {
  await db.delete(syncEpisode).where(eq(syncEpisode.syncItemId, syncItemId));
}
