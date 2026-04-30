import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";

interface LibraryStatusUpdate {
  inLibrary: boolean;
  downloaded?: boolean;
}

/**
 * Cross-context use case (media + lists). Both reads/writes flow through
 * their dedicated ports — `MediaRepositoryPort` for the media row, the
 * `ListsRepositoryPort` for the server-library list manipulation.
 */
export interface ManageLibraryStatusDeps {
  repo: ListsRepositoryPort;
  media: MediaRepositoryPort;
}

/**
 * Shared helper for addToLibrary and markDownloaded.
 * Sets library/download flags and adds to server library list.
 */
export async function setLibraryStatus(
  deps: ManageLibraryStatusDeps,
  mediaId: string,
  status: LibraryStatusUpdate,
) {
  const existing = await deps.media.findById(mediaId);
  if (!existing) return null;

  // Already in the desired state
  if (
    existing.inLibrary &&
    status.inLibrary &&
    (!status.downloaded || existing.downloaded)
  ) {
    return existing;
  }

  const updated = await deps.media.updateMedia(mediaId, {
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
