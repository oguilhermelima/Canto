import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "@canto/api/lib/settings-keys";
import { findAllFolders, findMediaPathsByFolder } from "@canto/api/infrastructure/repositories";
import { scanFolderForMedia } from "@canto/api/domain/use-cases/scan-folder-for-media";

export async function handleFolderScan(): Promise<void> {
  const enabled = await getSetting<boolean>(SETTINGS.SYNC_FOLDER_SCAN_ENABLED);
  if (!enabled) {
    console.log("[folder-scan] Disabled, skipping");
    return;
  }

  const folders = await findAllFolders(db);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let scannedFolders = 0;

  for (const folder of folders) {
    // Collect all paths: primary libraryPath + additional media paths
    const mediaPaths = await findMediaPathsByFolder(db, folder.id);
    const allPaths = new Set(
      [folder.libraryPath, ...mediaPaths.map((p) => p.path)].filter(Boolean) as string[],
    );

    if (allPaths.size === 0) continue;
    scannedFolders++;

    for (const path of allPaths) {
      const result = await scanFolderForMedia(db, path, folder.id);
      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalFailed += result.failed;
    }
  }

  if (scannedFolders === 0) {
    console.log("[folder-scan] No folders with scannable paths configured");
    return;
  }

  console.log(
    `[folder-scan] Scanned ${scannedFolders} folder(s). Imported: ${totalImported}, Skipped: ${totalSkipped}, Failed: ${totalFailed}`,
  );
}
