import type { Database } from "@canto/db/client";
import { addListItem, removeListItem } from "../../../infrastructure/repositories/lists/list";
import { removeMediaFromUserRecs, deleteUserRecommendationsForSource } from "../../../infrastructure/repositories/user-recommendation-repository";
import { dispatchMediaPipeline } from "../../../infrastructure/queue/bullmq-dispatcher";
import { addMediaToUserRecs } from "../rebuild-user-recs";
import { logAndSwallow } from "../../../lib/log-error";
import { verifyListOwnership } from "../../rules/list-rules";

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
