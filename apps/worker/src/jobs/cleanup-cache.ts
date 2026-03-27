import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "@canto/db/client";
import { extrasCache, media } from "@canto/db/schema";

/* -------------------------------------------------------------------------- */
/*  Main handler                                                              */
/* -------------------------------------------------------------------------- */

/** Remove extras_cache entries older than 30 days for non-library items. */
export async function handleCleanupCache(): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Delete extras_cache rows where:
  // 1. The cache entry is older than 30 days
  // 2. The associated media is NOT in the library
  const deleted = await db
    .delete(extrasCache)
    .where(
      and(
        lt(extrasCache.updatedAt, thirtyDaysAgo),
        sql`${extrasCache.mediaId} IN (
          SELECT ${media.id} FROM ${media}
          WHERE ${media.inLibrary} = false
        )`,
      ),
    )
    .returning();

  console.log(
    `[cleanup-cache] Removed ${deleted.length} stale cache entries for non-library items`,
  );
}
