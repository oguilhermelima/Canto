import type { Database } from "@canto/db/client";
import {
  addListItem,
  moveListItems,
  removeListItem,
  removeListItems,
} from "../../../infra/lists/list-repository";
import { removeMediaFromUserRecs, deleteUserRecommendationsForSource } from "../../../infra/recommendations/user-recommendation-repository";
import { dispatchMediaPipeline } from "../../../platform/queue/bullmq-dispatcher";
import { addMediaToUserRecs } from "../../recommendations/use-cases/rebuild-user-recs";
import { logAndSwallow } from "../../../platform/logger/log-error";
import { verifyListOwnership } from "../rules/list-rules";

/**
 * Add a media item to a user's list, with side effects:
 * 1. Remove the item from user's recommendations (it's now in a list)
 * 2. Enrich the media (credits, videos, recs) in background
 * 3. Add new recommendations based on this media
 */
export async function addItemToList(
  db: Database,
  input: { listId: string; mediaId: string; notes?: string },
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(db, input.listId, userId, userRole, { allowSystem: true });

  const item = await addListItem(db, {
    listId: input.listId,
    mediaId: input.mediaId,
    notes: input.notes,
  });

  // Side effects (fire-and-forget)
  void removeMediaFromUserRecs(db, userId, input.mediaId)
    .catch(logAndSwallow("list:addItem removeMediaFromUserRecs"));
  void dispatchMediaPipeline({ mediaId: input.mediaId })
    .catch(logAndSwallow("list:addItem dispatchMediaPipeline"));
  void addMediaToUserRecs(db, userId, input.mediaId)
    .catch(logAndSwallow("list:addItem addMediaToUserRecs"));

  return item;
}

/**
 * Remove a media item from a list and clean up per-user recommendation links.
 */
export async function removeItemFromList(
  db: Database,
  input: { listId: string; mediaId: string },
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(db, input.listId, userId, userRole, { allowSystem: true });

  await removeListItem(db, input.listId, input.mediaId);

  void deleteUserRecommendationsForSource(db, userId, input.mediaId)
    .catch(logAndSwallow("list:removeItem deleteUserRecommendationsForSource"));

  return { success: true };
}

/**
 * Remove multiple media items from a single list in one round-trip, with the
 * same per-item recs cleanup as removeItemFromList.
 */
export async function removeItemsFromList(
  db: Database,
  input: { listId: string; mediaIds: string[] },
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(db, input.listId, userId, userRole, {
    allowSystem: true,
  });

  await removeListItems(db, input.listId, input.mediaIds);

  for (const mediaId of input.mediaIds) {
    void deleteUserRecommendationsForSource(db, userId, mediaId).catch(
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
  db: Database,
  input: { fromListId: string; toListId: string; mediaIds: string[] },
  userId: string,
  userRole: string,
) {
  await verifyListOwnership(db, input.fromListId, userId, userRole, {
    allowSystem: true,
  });
  await verifyListOwnership(db, input.toListId, userId, userRole, {
    allowSystem: true,
  });

  await moveListItems(db, input.fromListId, input.toListId, input.mediaIds);

  return { success: true, count: input.mediaIds.length };
}
