import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media } from "@canto/db/schema";
import { setSetting } from "@canto/db/settings";
import { dispatchMediaPipeline } from "../../../infrastructure/queue/bullmq-dispatcher";

/**
 * Flip the `tvdb.defaultShows` flag and re-run the media pipeline for every
 * show already in the library so its season layout matches the new source
 * of truth. Returns the number of shows queued for reprocessing so the
 * admin UI can show progress.
 */
export async function toggleTvdbDefault(
  db: Database,
  enabled: boolean,
): Promise<{ success: true; reprocessing: number }> {
  await setSetting("tvdb.defaultShows", enabled);
  const shows = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.inLibrary, true), eq(media.type, "show")));
  for (const show of shows) {
    await dispatchMediaPipeline({ mediaId: show.id, useTVDBSeasons: enabled });
  }
  return { success: true, reprocessing: shows.length };
}
