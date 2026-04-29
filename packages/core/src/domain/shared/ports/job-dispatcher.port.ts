import type { TraktSection } from "../../../infra/trakt/trakt-sync-repository";
import type { EnsureMediaSpec } from "../../media/use-cases/ensure-media.types";

export interface JobDispatcherPort {
  /**
   * Enqueue a unified `ensureMedia` run for a single media id. Spec is
   * optional — without one, the cadence engine decides which aspects to
   * touch. Replaces the legacy `refreshExtras` / `reconcileShow` /
   * `translateEpisodes` / `reprocessMedia` shells.
   */
  enrichMedia(mediaId: string, spec?: EnsureMediaSpec): Promise<void>;

  rebuildUserRecs(userId: string): Promise<void>;

  /** Dispatch a single Trakt section pull/push job. The coordinator probes
   *  /sync/last_activities once per connection, then fans out per section
   *  through this hook. `remoteAtIso` is the watermark the section should
   *  advance to on success (null when there is no remote signal yet). */
  traktSyncSection(
    connectionId: string,
    section: TraktSection,
    remoteAtIso: string | null,
  ): Promise<void>;
}
