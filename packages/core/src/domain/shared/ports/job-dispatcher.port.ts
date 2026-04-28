import type { TraktSection } from "../../../infra/trakt/trakt-sync-repository";

export interface JobDispatcherPort {
  refreshExtras(mediaId: string): Promise<void>;
  reconcileShow(mediaId: string): Promise<void>;
  reprocessMedia(mediaId: string, useTVDBSeasons?: boolean): Promise<void>;
  translateEpisodes(mediaId: string, tvdbId: number, language: string): Promise<void>;
  rebuildUserRecs(userId: string): Promise<void>;
  refreshAllLanguage(): Promise<void>;
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
