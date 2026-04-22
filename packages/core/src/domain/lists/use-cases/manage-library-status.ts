import type { Database } from "@canto/db/client";
import {
  findMediaById,
  updateMedia,
} from "../../../infra/media/media-repository";
import {
  ensureServerLibrary,
  addListItem,
} from "../../../infra/lists/list-repository";

interface LibraryStatusUpdate {
  inLibrary: boolean;
  downloaded?: boolean;
}

/**
 * Shared helper for addToLibrary and markDownloaded.
 * Sets library/download flags and adds to server library list.
 */
export async function setLibraryStatus(
  db: Database,
  mediaId: string,
  status: LibraryStatusUpdate,
) {
  const existing = await findMediaById(db, mediaId);
  if (!existing) return null;

  // Already in the desired state
  if (existing.inLibrary && status.inLibrary && (!status.downloaded || existing.downloaded)) {
    return existing;
  }

  const updated = await updateMedia(db, mediaId, {
    inLibrary: status.inLibrary,
    ...(status.downloaded !== undefined && { downloaded: status.downloaded }),
    addedAt: existing.addedAt ?? new Date(),
  });

  if (!updated) return null;

  // Add to server library list
  const serverLib = await ensureServerLibrary(db);
  await addListItem(db, { listId: serverLib.id, mediaId });

  return updated;
}
