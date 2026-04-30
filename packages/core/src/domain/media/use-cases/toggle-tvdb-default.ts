import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media } from "@canto/db/schema";
import { setSetting } from "@canto/db/settings";
import { dispatchEnsureMedia } from "../../../platform/queue/bullmq-dispatcher";
import { logAndSwallow } from "../../../platform/logger/log-error";

/**
 * Flip the `tvdb.defaultShows` flag and eagerly re-run the structure
 * pipeline for every show already in the library so its season layout
 * matches the new source of truth. Returns the number of shows queued for
 * reprocessing so the admin UI can show progress.
 *
 * The flip surfaces in `effectiveProvider`, which `computePlan` compares
 * against `materialized_source` on each show's structure row — that's what
 * triggers the source-migration drop+reseed inside the structure strategy.
 * We force `aspects: ['structure']` so the cadence engine picks up the work
 * immediately instead of waiting for the next scheduled visit.
 *
 * The fan-out is fire-and-forget — the toggle response returns as soon as
 * the setting is persisted and the show list is read. Per-show dispatch
 * errors are logged and swallowed so a single Redis hiccup doesn't strand
 * the toggle; the daily cadence sweep would catch any miss anyway.
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

  void Promise.all(
    shows.map((show) =>
      dispatchEnsureMedia(show.id, {
        aspects: ["structure"],
        force: true,
      }).catch(logAndSwallow(`toggleTvdbDefault dispatch ${show.id}`)),
    ),
  );

  return { success: true, reprocessing: shows.length };
}
