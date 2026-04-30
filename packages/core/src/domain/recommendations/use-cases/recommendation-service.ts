import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";

export interface BuildExclusionSetDeps {
  media: MediaRepositoryPort;
  lists: ListsRepositoryPort;
  userMedia: UserMediaRepositoryPort;
}

/**
 * Build the set of `(externalId, provider)` pairs the recs/spotlight readers
 * must skip:
 * - Anything already in the global library (no point recommending what's
 *   on the server).
 * - Anything already in any of the user's lists (already in their backlog).
 * - Anything the user has dropped or rated ≤ 3 (explicit negative signal —
 *   never recommend dispatched content).
 */
export async function buildExclusionSet(
  deps: BuildExclusionSetDeps,
  userId: string,
) {
  const [libraryItems, userListItems, negativeItems] = await Promise.all([
    deps.media.findLibraryExternalIds(),
    deps.lists.findUserListExternalIds(userId),
    deps.userMedia.findNegativeSignalExternalIds(userId),
  ]);
  const excludeSet = new Map<string, { externalId: number; provider: string }>();
  for (const item of libraryItems) excludeSet.set(`${item.provider}-${item.externalId}`, item);
  for (const item of userListItems) excludeSet.set(`${item.provider}-${item.externalId}`, item);
  for (const item of negativeItems) excludeSet.set(`${item.provider}-${item.externalId}`, item);
  return { excludeSet, excludeItems: [...excludeSet.values()] };
}

