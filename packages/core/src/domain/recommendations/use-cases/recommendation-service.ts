import type { Database } from "@canto/db/client";
import { findLibraryExternalIds } from "../../../infra/media/media-repository";
import { findUserListExternalIds } from "../../../infra/lists/list-repository";

/** Build exclusion set: library items + user's list items (for recommendations/spotlight) */
export async function buildExclusionSet(db: Database, userId: string) {
  const [libraryItems, userListItems] = await Promise.all([
    findLibraryExternalIds(db),
    findUserListExternalIds(db, userId),
  ]);
  const excludeSet = new Map<string, { externalId: number; provider: string }>();
  for (const item of libraryItems) excludeSet.set(`${item.provider}-${item.externalId}`, item);
  for (const item of userListItems) excludeSet.set(`${item.provider}-${item.externalId}`, item);
  return { excludeSet, excludeItems: [...excludeSet.values()] };
}
