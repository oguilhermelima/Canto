import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { scanFolderForMedia } from "@canto/core/domain/file-organization/use-cases/scan-folder-for-media";
import {
  findAllFolders,
  findMediaPathsByFolder,
} from "@canto/core/infra/file-organization/folder-repository";
import { makeListsRepository } from "@canto/core/infra/lists/lists-repository.adapter";
import { makeMediaAspectStateRepository } from "@canto/core/infra/media/media-aspect-state-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { createNodeFileSystemAdapter } from "@canto/core/platform/fs/filesystem";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";
import { jobDispatcher } from "@canto/core/platform/queue/job-dispatcher.adapter";

export async function handleFolderScan(): Promise<void> {
  const enabled = await getSetting("sync.folderScan.enabled");
  if (!enabled) {
    console.log("[folder-scan] Disabled, skipping");
    return;
  }

  const folders = await findAllFolders(db);
  const fs = createNodeFileSystemAdapter();
  const logger = makeConsoleLogger();
  const tmdb = await getTmdbProvider();
  const media = makeMediaRepository(db);
  const aspectState = makeMediaAspectStateRepository(db);
  const lists = makeListsRepository(db);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let scannedFolders = 0;

  for (const folder of folders) {
    const mediaPaths = await findMediaPathsByFolder(db, folder.id);
    const allPaths = new Set(
      [folder.libraryPath, ...mediaPaths.map((p) => p.path)].filter(
        Boolean,
      ) as string[],
    );

    if (allPaths.size === 0) continue;
    scannedFolders++;

    for (const path of allPaths) {
      const result = await scanFolderForMedia(db, path, folder.id, {
        fs,
        logger,
        dispatcher: jobDispatcher,
        tmdb,
        media,
        aspectState,
        lists,
      });
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
