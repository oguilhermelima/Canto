import type { Database } from "@canto/db/client";
import { findAllFolders, updateFolder } from "@canto/core/infra/repositories";

/**
 * Ensure at least one download folder is marked as default.
 * If none is default, pick the first enabled folder.
 */
export async function autoElectDefault(db: Database): Promise<void> {
  const folders = await findAllFolders(db);
  if (folders.length === 0) return;

  const hasDefault = folders.some((f) => f.isDefault);
  if (hasDefault) return;

  const first = folders.find((f) => f.enabled) ?? folders[0];
  if (first) {
    await updateFolder(db, first.id, { isDefault: true });
  }
}
