import { setSetting } from "@canto/db/settings";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";

export interface ToggleTvdbDefaultDeps {
  media: MediaRepositoryPort;
  dispatcher: JobDispatcherPort;
  logger: LoggerPort;
}

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
  deps: ToggleTvdbDefaultDeps,
  enabled: boolean,
): Promise<{ success: true; reprocessing: number }> {
  await setSetting("tvdb.defaultShows", enabled);
  const showIds = await deps.media.findShowIdsInLibrary();

  void Promise.all(
    showIds.map((id) =>
      deps.dispatcher
        .enrichMedia(id, { aspects: ["structure"], force: true })
        .catch(deps.logger.logAndSwallow(`toggleTvdbDefault dispatch ${id}`)),
    ),
  );

  return { success: true, reprocessing: showIds.length };
}
