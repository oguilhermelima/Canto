import { and, count, desc, eq, getTableColumns, inArray, isNull, isNotNull, lt, or } from "drizzle-orm";
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
      jellyfinItemId: syncItem.jellyfinItemId,
      plexRatingKey: syncItem.plexRatingKey,
    })
    .from(syncItem)
    .where(eq(syncItem.mediaId, mediaId));
}

export interface SyncItemFilters {
  libraryId?: string;
  /** Filter by server: "jellyfin" = jellyfinItemId IS NOT NULL, "plex" = plexRatingKey IS NOT NULL */
  server?: string;
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
  if (filters.server === "jellyfin") conditions.push(isNotNull(syncItem.jellyfinItemId));
  if (filters.server === "plex") conditions.push(isNotNull(syncItem.plexRatingKey));
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

/**
 * Unified upsert that merges Jellyfin and Plex into a single row per media item.
 *
 * Lookup order:
 * 1. By (tmdbId, libraryId) — finds an existing unified row from the other server.
 * 2. By server-specific ID (jellyfinItemId or plexRatingKey) — finds the row for this server.
 *
 * If found: merges the server-specific side (fills in the new columns for this server).
 * If not found: inserts a new row.
 *
 * Resolved items (mediaId set) are protected: their tmdbId/mediaId/result are never
 * overwritten by an incoming item with a different tmdbId.
 */
export async function upsertUnifiedSyncItem(
  db: Database,
  data: typeof syncItem.$inferInsert,
) {
  const source = data.source as "jellyfin" | "plex" | null | undefined;

  // Step 1: find by (tmdbId, libraryId) — cross-server lookup
  let existing: typeof syncItem.$inferSelect | undefined;

  if (data.tmdbId != null && data.libraryId != null) {
    existing = await db.query.syncItem.findFirst({
      where: and(
        eq(syncItem.tmdbId, data.tmdbId),
        eq(syncItem.libraryId, data.libraryId),
      ),
    });
  }

  // Step 2: fall back to server-specific ID
  if (!existing) {
    if (source === "jellyfin" && data.jellyfinItemId) {
      existing = await db.query.syncItem.findFirst({
        where: eq(syncItem.jellyfinItemId, data.jellyfinItemId),
      });
    } else if (source === "plex" && data.plexRatingKey) {
      existing = await db.query.syncItem.findFirst({
        where: eq(syncItem.plexRatingKey, data.plexRatingKey),
      });
    }
  }

  if (existing) {
    const isAlreadyResolved = !!existing.mediaId;
    const incomingDiffers = isAlreadyResolved && data.tmdbId !== existing.tmdbId;

    // Server-specific columns for this side
    const serverSideUpdate =
      source === "jellyfin"
        ? {
            jellyfinItemId: data.jellyfinItemId,
            jellyfinServerLinkId: data.jellyfinServerLinkId ?? data.serverLinkId,
            jellyfinSyncedAt: data.jellyfinSyncedAt ?? data.syncedAt,
          }
        : source === "plex"
          ? {
              plexRatingKey: data.plexRatingKey,
              plexServerLinkId: data.plexServerLinkId ?? data.serverLinkId,
              plexSyncedAt: data.plexSyncedAt ?? data.syncedAt,
            }
          : {};

    await db
      .update(syncItem)
      .set({
        serverItemTitle: data.serverItemTitle,
        serverItemPath: data.serverItemPath,
        serverItemYear: data.serverItemYear,
        ...serverSideUpdate,
        ...(incomingDiffers
          ? {}
          : { tmdbId: data.tmdbId, mediaId: data.mediaId, result: data.result, reason: data.reason }),
        syncedAt: data.syncedAt,
        // Keep legacy columns updated for backwards compat during transition
        serverLinkId: data.serverLinkId,
        source: data.source,
      })
      .where(eq(syncItem.id, existing.id));
    return existing;
  }

  const [row] = await db
    .insert(syncItem)
    .values({
      ...data,
      // Populate server-specific columns from legacy fields if not set
      jellyfinServerLinkId:
        data.jellyfinServerLinkId ??
        (data.source === "jellyfin" ? data.serverLinkId : undefined),
      plexServerLinkId:
        data.plexServerLinkId ??
        (data.source === "plex" ? data.serverLinkId : undefined),
      jellyfinSyncedAt:
        data.jellyfinSyncedAt ??
        (data.source === "jellyfin" ? data.syncedAt : undefined),
      plexSyncedAt:
        data.plexSyncedAt ??
        (data.source === "plex" ? data.syncedAt : undefined),
    })
    .returning();
  return row;
}

/** @deprecated Use upsertUnifiedSyncItem instead */
export async function upsertSyncItemByServerKey(
  db: Database,
  data: typeof syncItem.$inferInsert,
) {
  return upsertUnifiedSyncItem(db, data);
}

export async function pruneOldSyncItems(
  db: Database,
  libraryIds: string[],
  source: string,
  cutoffDate: Date,
  serverLinkIds?: string[],
) {
  if (source === "jellyfin") {
    await pruneServerSide(db, "jellyfin", libraryIds, serverLinkIds, cutoffDate);
  } else if (source === "plex") {
    await pruneServerSide(db, "plex", libraryIds, serverLinkIds, cutoffDate);
  }
}

async function pruneServerSide(
  db: Database,
  side: "jellyfin" | "plex",
  libraryIds: string[],
  serverLinkIds: string[] | undefined,
  cutoffDate: Date,
) {
  const syncedAtCol = side === "jellyfin" ? syncItem.jellyfinSyncedAt : syncItem.plexSyncedAt;
  const serverLinkIdCol =
    side === "jellyfin" ? syncItem.jellyfinServerLinkId : syncItem.plexServerLinkId;

  // Build the "belongs to this sync run" condition
  const belongsConditions = [];
  if (libraryIds.length > 0) belongsConditions.push(inArray(syncItem.libraryId, libraryIds));
  if (serverLinkIds && serverLinkIds.length > 0) {
    belongsConditions.push(inArray(serverLinkIdCol, serverLinkIds));
  }
  if (belongsConditions.length === 0) return;

  const staleCondition = or(
    isNull(syncedAtCol),
    lt(syncedAtCol, cutoffDate),
  );

  // Null out the server-specific side for stale items
  const clearUpdate =
    side === "jellyfin"
      ? {
          jellyfinItemId: null,
          jellyfinServerLinkId: null,
          jellyfinSyncedAt: null,
        }
      : {
          plexRatingKey: null,
          plexServerLinkId: null,
          plexSyncedAt: null,
        };

  await db
    .update(syncItem)
    .set(clearUpdate)
    .where(and(or(...belongsConditions), staleCondition));

  // Delete rows where both sides are now empty
  await db
    .delete(syncItem)
    .where(
      and(
        or(...belongsConditions),
        isNull(syncItem.jellyfinItemId),
        isNull(syncItem.plexRatingKey),
      ),
    );
}

export async function deleteSyncEpisodesBySyncItemId(db: Database, syncItemId: string) {
  await db.delete(syncEpisode).where(eq(syncEpisode.syncItemId, syncItemId));
}

export async function deleteSyncEpisodesBySource(
  db: Database,
  syncItemId: string,
  source: string,
) {
  await db
    .delete(syncEpisode)
    .where(and(eq(syncEpisode.syncItemId, syncItemId), eq(syncEpisode.source, source)));
}
