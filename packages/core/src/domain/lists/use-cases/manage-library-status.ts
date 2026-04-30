import type { Database } from "@canto/db/client";
import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import {
  findMediaById,
  updateMedia,
} from "@canto/core/infra/media/media-repository";

interface LibraryStatusUpdate {
  inLibrary: boolean;
  downloaded?: boolean;
}

/**
 * Cross-context use case (media + lists). Media reads/writes still live on
 * `db` until the media wave lands; the server-library list manipulation goes
 * through `ListsRepositoryPort`.
 */
export interface ManageLibraryStatusDeps {
  repo: ListsRepositoryPort;
}

/**
 * Shared helper for addToLibrary and markDownloaded.
 * Sets library/download flags and adds to server library list.
 */
export async function setLibraryStatus(
  deps: ManageLibraryStatusDeps,
  db: Database,
  mediaId: string,
  status: LibraryStatusUpdate,
) {
  const existing = await findMediaById(db, mediaId);
  if (!existing) return null;

  // Already in the desired state
  if (
    existing.inLibrary &&
    status.inLibrary &&
    (!status.downloaded || existing.downloaded)
  ) {
    return existing;
  }

  const updated = await updateMedia(db, mediaId, {
    inLibrary: status.inLibrary,
    ...(status.downloaded !== undefined && { downloaded: status.downloaded }),
    addedAt: existing.addedAt ?? new Date(),
  });

  if (!updated) return null;

  // Add to server library list
  const serverLib = await deps.repo.ensureServerLibrary();
  await deps.repo.addItem({ listId: serverLib.id, mediaId });

  return updated;
}
