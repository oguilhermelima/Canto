import { access, constants } from "node:fs/promises";

import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { findImportedFilesByMediaIds } from "@canto/core/infra/media/media-repository";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { createNotification } from "@canto/core/domain/notifications/use-cases/create-notification";
import { makeNotificationsRepository } from "@canto/core/infra/notifications/notifications-repository.adapter";

/**
 * Periodic validation: checks that media marked as `downloaded` still has
 * at least one imported file on disk. If not, reverts `downloaded` to false
 * (keeps `inLibrary` intact so the user can re-download).
 *
 * Runs every 6 hours.
 */
export async function handleValidateDownloads(): Promise<void> {
  const importMethod = (await getSetting("download.importMethod")) ?? "local";

  // Only validate local imports — remote imports can't be checked from Canto's filesystem
  if (importMethod === "remote") return;

  const media = makeMediaRepository(db);
  const downloadedMedia = await media.findDownloadedLibraryMedia();
  if (downloadedMedia.length === 0) return;

  // One SELECT for every imported file across the whole batch.
  const allFiles = await findImportedFilesByMediaIds(
    db,
    downloadedMedia.map((m) => m.id),
  );
  const filesByMediaId = new Map<string, Array<{ filePath: string | null }>>();
  for (const f of allFiles) {
    const list = filesByMediaId.get(f.mediaId);
    if (list) list.push({ filePath: f.filePath });
    else filesByMediaId.set(f.mediaId, [{ filePath: f.filePath }]);
  }

  const notificationsRepo = makeNotificationsRepository(db);
  let invalidated = 0;

  for (const row of downloadedMedia) {
    const files = filesByMediaId.get(row.id) ?? [];

    if (files.length === 0) {
      // No imported files in DB — mark as not downloaded
      await media.updateMedia(row.id, { downloaded: false });
      invalidated++;
      continue;
    }

    // Check at least one file exists on disk — checks run in parallel.
    const checks = await Promise.all(
      files.map(async (file) => {
        if (!file.filePath) return false;
        try {
          await access(file.filePath, constants.F_OK);
          return true;
        } catch {
          return false;
        }
      }),
    );
    const anyExists = checks.some((ok) => ok);

    if (!anyExists) {
      await media.updateMedia(row.id, { downloaded: false });
      await createNotification(
        { repo: notificationsRepo },
        {
          title: "Files no longer found",
          message: `Downloaded files for "${row.title}" are no longer accessible. The media remains in your library but is marked as not downloaded.`,
          type: "import_failed",
          mediaId: row.id,
        },
      );
      invalidated++;
    }
  }

  if (invalidated > 0) {
    console.log(`[validate-downloads] Invalidated ${invalidated} media item(s) with missing files`);
  }
}
