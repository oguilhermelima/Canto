import { and, count, desc, eq, inArray, lt } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userMediaLibrary, media } from "@canto/db/schema";

/**
 * Add a media item to a user's server library (idempotent).
 * Returns the inserted/existing row.
 */
export async function addToUserMediaLibrary(
  db: Database,
  data: {
    userId: string;
    mediaId: string;
    source: "jellyfin" | "plex";
    serverLinkId?: string | null;
    serverItemId?: string | null;
  },
) {
  const now = new Date();
  const [row] = await db
    .insert(userMediaLibrary)
    .values({
      userId: data.userId,
      mediaId: data.mediaId,
      source: data.source,
      serverLinkId: data.serverLinkId ?? null,
      serverItemId: data.serverItemId ?? null,
      addedAt: now,
      lastSyncedAt: now,
    })
    .onConflictDoUpdate({
      target: [userMediaLibrary.userId, userMediaLibrary.mediaId, userMediaLibrary.source],
      set: {
        lastSyncedAt: now,
        serverLinkId: data.serverLinkId ?? null,
        serverItemId: data.serverItemId ?? null,
      },
    })
    .returning();
  return row;
}

/**
 * Check if a user has a specific media item in their server library.
 */
export async function isInUserMediaLibrary(
  db: Database,
  userId: string,
  mediaId: string,
): Promise<boolean> {
  const row = await db.query.userMediaLibrary.findFirst({
    where: and(
      eq(userMediaLibrary.userId, userId),
      eq(userMediaLibrary.mediaId, mediaId),
    ),
    columns: { id: true },
  });
  return !!row;
}

/**
 * Get all media IDs in a user's server library.
 */
export async function findUserMediaLibraryIds(
  db: Database,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ mediaId: userMediaLibrary.mediaId })
    .from(userMediaLibrary)
    .where(eq(userMediaLibrary.userId, userId));
  return rows.map((r) => r.mediaId);
}

/**
 * Remove items from a user's library that weren't seen in the latest sync.
 * Uses lastSyncedAt cutoff to identify stale entries.
 */
export async function pruneStaleUserMediaLibrary(
  db: Database,
  userId: string,
  source: "jellyfin" | "plex",
  syncRunStart: Date,
): Promise<number> {
  const result = await db
    .delete(userMediaLibrary)
    .where(
      and(
        eq(userMediaLibrary.userId, userId),
        eq(userMediaLibrary.source, source),
        lt(userMediaLibrary.lastSyncedAt, syncRunStart),
      ),
    );
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

/**
 * Get a user's server library media (with media metadata) — paginated.
 */
export async function findUserMediaLibrary(
  db: Database,
  userId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const { limit = 50, offset = 0 } = opts;

  const [items, [countRow]] = await Promise.all([
    db
      .select({
        media,
        addedAt: userMediaLibrary.addedAt,
        source: userMediaLibrary.source,
      })
      .from(userMediaLibrary)
      .innerJoin(media, eq(userMediaLibrary.mediaId, media.id))
      .where(eq(userMediaLibrary.userId, userId))
      .orderBy(desc(userMediaLibrary.addedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(userMediaLibrary)
      .where(eq(userMediaLibrary.userId, userId)),
  ]);

  return { items, total: countRow?.total ?? 0 };
}

/**
 * Get library count per user (for admin dashboards).
 */
export async function getUserMediaLibraryCounts(
  db: Database,
): Promise<Array<{ userId: string; count: number }>> {
  const rows = await db
    .select({
      userId: userMediaLibrary.userId,
      count: count(),
    })
    .from(userMediaLibrary)
    .groupBy(userMediaLibrary.userId);
  return rows;
}

/**
 * Filter a set of mediaIds to only those already in the user's library
 * (used to short-circuit re-processing in sync jobs).
 */
export async function findExistingUserLibraryMediaIds(
  db: Database,
  userId: string,
  mediaIds: string[],
): Promise<Set<string>> {
  if (mediaIds.length === 0) return new Set();
  const rows = await db
    .select({ mediaId: userMediaLibrary.mediaId, lastSyncedAt: userMediaLibrary.lastSyncedAt })
    .from(userMediaLibrary)
    .where(
      and(
        eq(userMediaLibrary.userId, userId),
        inArray(userMediaLibrary.mediaId, mediaIds),
      ),
    );
  return new Set(rows.map((r) => r.mediaId));
}
