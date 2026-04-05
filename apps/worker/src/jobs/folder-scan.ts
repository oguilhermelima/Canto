import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "@canto/api/lib/settings-keys";
import { findAllFolders } from "@canto/api/infrastructure/repositories";
import { scanFolderForMedia } from "@canto/api/domain/use-cases/scan-folder-for-media";

export async function handleFolderScan(): Promise<void> {
  const enabled = await getSetting<boolean>(SETTINGS.SYNC_FOLDER_SCAN_ENABLED);
  if (!enabled) {
    console.log("[folder-scan] Disabled, skipping");
    return;
  }

  const folders = await findAllFolders(db);
  const withLibraryPath = folders.filter((f) => f.libraryPath);

  if (withLibraryPath.length === 0) {
    console.log("[folder-scan] No folders with libraryPath configured");
    return;
  }

  console.log(`[folder-scan] Scanning ${withLibraryPath.length} folder(s)...`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const folder of withLibraryPath) {
    const result = await scanFolderForMedia(db, folder.libraryPath!, folder.id);
    totalImported += result.imported;
    totalSkipped += result.skipped;
    totalFailed += result.failed;
  }

  console.log(
    `[folder-scan] All done. Imported: ${totalImported}, Skipped: ${totalSkipped}, Failed: ${totalFailed}`,
  );
}
