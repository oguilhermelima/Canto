import type { ListsRepositoryPort } from "@canto/core/domain/lists/ports/lists-repository.port";

export interface AddToServerLibraryDeps {
  repo: ListsRepositoryPort;
}

export async function addMediaToServerLibrary(
  deps: AddToServerLibraryDeps,
  mediaId: string,
) {
  const serverLib = await deps.repo.ensureServerLibrary();
  return deps.repo.addItem({ listId: serverLib.id, mediaId });
}
