import { access, constants } from "node:fs/promises";

import { eq, and } from "drizzle-orm";

import { db } from "@canto/db/client";
import { media, mediaFile } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "@canto/api/lib/settings-keys";
import { updateMedia } from "@canto/api/infrastructure/repositories";
import { createNotification } from "@canto/api/domain/use-cases/create-notification";

/**
 * Periodic validation: checks that media marked as `downloaded` still has
 * at least one imported file on disk. If not, reverts `downloaded` to false
 * (keeps `inLibrary` intact so the user can re-download).
 *
 * Runs every 6 hours.
 */
export async function handleValidateDownloads(): Promise<void> {
  const importMethod = (await getSetting<string>(SETTINGS.IMPORT_METHOD)) ?? "local";

  // Only validate local imports — remote imports can't be checked from Canto's filesystem
  if (importMethod === "remote") return;

  const downloadedMedia = await db.query.media.findMany({
    where: and(eq(media.downloaded, true), eq(media.inLibrary, true)),
    columns: { id: true, title: true },
  });

  if (downloadedMedia.length === 0) return;

  let invalidated = 0;

  for (const row of downloadedMedia) {
    const files = await db.query.mediaFile.findMany({
      where: and(eq(mediaFile.mediaId, row.id), eq(mediaFile.status, "imported")),
      columns: { id: true, filePath: true },
    });

    if (files.length === 0) {
      // No imported files in DB — mark as not downloaded
      await updateMedia(db, row.id, { downloaded: false });
      invalidated++;
      continue;
    }

    // Check at least one file exists on disk
    let anyExists = false;
    for (const file of files) {
      if (!file.filePath) continue;
      try {
        await access(file.filePath, constants.F_OK);
        anyExists = true;
        break;
      } catch {
        // File not accessible
      }
    }

    if (!anyExists) {
      await updateMedia(db, row.id, { downloaded: false });
      await createNotification(db, {
        title: "Files no longer found",
        message: `Downloaded files for "${row.title}" are no longer accessible. The media remains in your library but is marked as not downloaded.`,
        type: "import_failed",
        mediaId: row.id,
      });
      invalidated++;
    }
  }

  if (invalidated > 0) {
    console.log(`[validate-downloads] Invalidated ${invalidated} media item(s) with missing files`);
  }
}
