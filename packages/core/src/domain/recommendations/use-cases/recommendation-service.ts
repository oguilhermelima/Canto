import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media, userMediaState } from "@canto/db/schema";
import { findLibraryExternalIds } from "../../../infra/media/media-repository";
import { findUserListExternalIds } from "../../../infra/lists/list-repository";

/**
 * Build the set of `(externalId, provider)` pairs the recs/spotlight readers
 * must skip:
 * - Anything already in the global library (no point recommending what's
 *   on the server).
 * - Anything already in any of the user's lists (already in their backlog).
 * - Anything the user has dropped or rated ≤ 3 (explicit negative signal —
 *   never recommend dispatched content).
 */
export async function buildExclusionSet(db: Database, userId: string) {
  const [libraryItems, userListItems, negativeItems] = await Promise.all([
    findLibraryExternalIds(db),
    findUserListExternalIds(db, userId),
    findUserNegativeSignalExternalIds(db, userId),
  ]);
  const excludeSet = new Map<string, { externalId: number; provider: string }>();
  for (const item of libraryItems) excludeSet.set(`${item.provider}-${item.externalId}`, item);
  for (const item of userListItems) excludeSet.set(`${item.provider}-${item.externalId}`, item);
  for (const item of negativeItems) excludeSet.set(`${item.provider}-${item.externalId}`, item);
  return { excludeSet, excludeItems: [...excludeSet.values()] };
}

/**
 * `(externalId, provider)` pairs for media the user has explicitly disliked
 * (status='dropped' or rating ≤ 3). Used by the recs read path to ensure
 * they never resurface, regardless of which fallback path serves them.
 */
async function findUserNegativeSignalExternalIds(
  db: Database,
  userId: string,
): Promise<Array<{ externalId: number; provider: string }>> {
  const rows = await db
    .select({ externalId: media.externalId, provider: media.provider })
    .from(userMediaState)
    .innerJoin(media, eq(media.id, userMediaState.mediaId))
    .where(
      and(
        eq(userMediaState.userId, userId),
        sql`(${userMediaState.status} = 'dropped' OR (${userMediaState.rating} IS NOT NULL AND ${userMediaState.rating} <= 3))`,
      ),
    );
  return rows;
}

