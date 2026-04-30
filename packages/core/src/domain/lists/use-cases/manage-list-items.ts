import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import type { RecommendationsRepositoryPort } from "@canto/core/domain/recommendations/ports/recommendations-repository.port";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import { verifyListOwnership } from "@canto/core/domain/lists/rules/list-rules";
import { addMediaToUserRecs } from "@canto/core/domain/recommendations/use-cases/rebuild-user-recs";
import { logAndSwallow } from "@canto/core/platform/logger/log-error";

/**
 * Cross-context use case. Lists CRUD via `ListsRepositoryPort`,
 * recommendations cleanup via `RecommendationsRepositoryPort`, add-recs via
 * `UserMediaRepositoryPort`. Background enrichment uses `JobDispatcherPort`.
 */
export interface ManageListItemsDeps {
  repo: ListsRepositoryPort;
  recs: RecommendationsRepositoryPort;
  userMedia: UserMediaRepositoryPort;
  // FIXME(wave-10): make required once callers in packages/api wire this port
  dispatcher?: JobDispatcherPort;
}

/**
 * Add a media item to a user's list, with side effects:
 * 1. Remove the item from user's recommendations (it's now in a list)
 * 2. Enrich the media (credits, videos, recs) in background
 * 3. Add new recommendations based on this media
 */
export async function addItemToList(
  deps: ManageListItemsDeps,
  input: { listId: string; mediaId: string; notes?: string },
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(deps.repo, input.listId, userId, userRole, {
    allowSystem: true,
  });

  const item = await deps.repo.addItem({
    listId: input.listId,
    mediaId: input.mediaId,
    notes: input.notes,
  });

  void deps.recs.removeMediaFromUserRecs(userId, input.mediaId).catch(
    logAndSwallow("list:addItem removeMediaFromUserRecs"),
  );
  void deps.dispatcher?.enrichMedia(input.mediaId).catch(
    logAndSwallow("list:addItem dispatchEnsureMedia"),
  );
  void addMediaToUserRecs(
    { recs: deps.recs, userMedia: deps.userMedia },
    userId,
    input.mediaId,
  ).catch(logAndSwallow("list:addItem addMediaToUserRecs"));

  return item;
}

/**
 * Remove a media item from a list and clean up per-user recommendation links.
 */
export async function removeItemFromList(
  deps: ManageListItemsDeps,
  input: { listId: string; mediaId: string },
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(deps.repo, input.listId, userId, userRole, {
    allowSystem: true,
  });

  await deps.repo.removeItem(input.listId, input.mediaId);

  void deps.recs.deleteUserRecommendationsForSource(userId, input.mediaId).catch(
    logAndSwallow("list:removeItem deleteUserRecommendationsForSource"),
  );

  return { success: true };
}

/**
 * Remove multiple media items from a single list in one round-trip, with the
 * same per-item recs cleanup as removeItemFromList.
 */
export async function removeItemsFromList(
  deps: ManageListItemsDeps,
  input: { listId: string; mediaIds: string[] },
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(deps.repo, input.listId, userId, userRole, {
    allowSystem: true,
  });

  await deps.repo.removeItems(input.listId, input.mediaIds);

  for (const mediaId of input.mediaIds) {
    void deps.recs.deleteUserRecommendationsForSource(userId, mediaId).catch(
      logAndSwallow("list:removeItems deleteUserRecommendationsForSource"),
    );
  }

  return { success: true, count: input.mediaIds.length };
}

/**
 * Move items between two lists owned/edited by the user. Duplicates in the
 * target are silently skipped (insert uses onConflictDoNothing) but still
 * removed from the source so the action matches user intent.
 */
export async function moveItemsBetweenLists(
  deps: ManageListItemsDeps,
  input: { fromListId: string; toListId: string; mediaIds: string[] },
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(deps.repo, input.fromListId, userId, userRole, {
    allowSystem: true,
  });
  await verifyListOwnership(deps.repo, input.toListId, userId, userRole, {
    allowSystem: true,
  });

  await deps.repo.moveItems(input.fromListId, input.toListId, input.mediaIds);

  return { success: true, count: input.mediaIds.length };
}

/**
 * Un-tombstone soft-deleted rows. The user-facing escape hatch when a sync
 * (or accidental click) wiped items they wanted. Restores `id`, `added_at`,
 * `notes`, and `last_pushed_at`; the next sync will reconcile them with Trakt.
 */
export async function restoreItemsToList(
  deps: ManageListItemsDeps,
  input: { listId: string; mediaIds: string[] },
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(deps.repo, input.listId, userId, userRole, {
    allowSystem: true,
  });

  const restored = await deps.repo.restoreItems(input.listId, input.mediaIds);
  return { success: true, count: restored };
}
