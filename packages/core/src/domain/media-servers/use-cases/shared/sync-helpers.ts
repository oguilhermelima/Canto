import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";

/**
 * Ensure at least one download folder is marked as default. If none is set,
 * promote the first enabled folder, falling back to the first folder of any.
 */
export async function autoElectDefault(
  folders: FoldersRepositoryPort,
): Promise<void> {
  const all = await folders.findAllFolders();
  if (all.length === 0) return;

  if (all.some((f) => f.isDefault)) return;

  const candidate = all.find((f) => f.enabled) ?? all[0];
  if (candidate) {
    await folders.updateFolder(candidate.id, { isDefault: true });
  }
}
