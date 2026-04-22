import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { findAllFolders, findMediaPathsByFolder } from "@canto/core/infra/repositories";
import { scanFolderForMedia } from "@canto/core/domain/use-cases/file-organization/scan-folder-for-media";
import { createNodeFileSystemAdapter } from "@canto/core/platform/fs/filesystem";

export async function handleFolderScan(): Promise<void> {
  const enabled = await getSetting("sync.folderScan.enabled");
  if (!enabled) {
    console.log("[folder-scan] Disabled, skipping");
    return;
  }

  const folders = await findAllFolders(db);
  const fs = createNodeFileSystemAdapter();

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
      const result = await scanFolderForMedia(db, path, folder.id, { fs });
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
