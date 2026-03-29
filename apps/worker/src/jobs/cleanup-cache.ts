import { and, lt, sql } from "drizzle-orm";

import { db } from "@canto/db/client";
import { extrasCache, media } from "@canto/db/schema";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Cache entries older than this are removed even for library items. */
const STALE_THRESHOLD_DAYS = 30;

/* -------------------------------------------------------------------------- */
/*  Main handler                                                              */
/* -------------------------------------------------------------------------- */

export async function handleCleanupCache(): Promise<void> {
  let totalDeleted = 0;

  // 1. Delete ALL extras_cache entries for non-library media (any age)
  const nonLibraryDeleted = await db
    .delete(extrasCache)
    .where(
      sql`${extrasCache.mediaId} IN (
        SELECT ${media.id} FROM ${media}
        WHERE ${media.inLibrary} = false
      )`,
    )
    .returning();

  totalDeleted += nonLibraryDeleted.length;

  if (nonLibraryDeleted.length > 0) {
    console.log(
      `[cleanup-cache] Removed ${nonLibraryDeleted.length} cache entries for non-library items`,
    );
  }

  // 2. Delete stale extras_cache entries for library items (older than threshold)
  const staleThreshold = new Date(
    Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
  );

  const staleDeleted = await db
    .delete(extrasCache)
    .where(
      and(
        lt(extrasCache.updatedAt, staleThreshold),
        sql`${extrasCache.mediaId} IN (
          SELECT ${media.id} FROM ${media}
          WHERE ${media.inLibrary} = true
        )`,
      ),
    )
    .returning();

  totalDeleted += staleDeleted.length;

  if (staleDeleted.length > 0) {
    console.log(
      `[cleanup-cache] Removed ${staleDeleted.length} stale cache entries (>${STALE_THRESHOLD_DAYS} days) for library items`,
    );
  }

  console.log(`[cleanup-cache] Total removed: ${totalDeleted} cache entries`);
}
