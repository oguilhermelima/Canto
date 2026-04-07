export interface JobDispatcherPort {
  refreshExtras(mediaId: string): Promise<void>;
  reconcileShow(mediaId: string): Promise<void>;
  reprocessMedia(mediaId: string, useTVDBSeasons?: boolean): Promise<void>;
  translateEpisodes(mediaId: string, tvdbId: number, language: string): Promise<void>;
  rebuildUserRecs(userId: string): Promise<void>;
  refreshAllLanguage(): Promise<void>;
}
