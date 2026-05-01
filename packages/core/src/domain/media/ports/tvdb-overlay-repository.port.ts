/**
 * Port for the TVDB overlay flow — covers the cross-context reads/writes the
 * overlay orchestration needs (media + season + episode + their localizations
 * plus user_media + file-organization rows that hold an episode FK).
 *
 * Lives outside `MediaRepositoryPort` because the surface crosses three
 * contexts: media (season/episode/localizations), user-media
 * (user_playback_progress, user_watch_history, user_rating), and
 * file-organization (media_file). Keeps `MediaRepositoryPort` focused on
 * media-only operations.
 */
export interface ExistingSeasonStructure {
  id: string;
  number: number;
  episodes: Array<{ id: string; number: number; absoluteNumber: number | null }>;
}

export interface SavedEpisodeLocalization {
  episodeId: string;
  language: string;
  title: string | null;
  overview: string | null;
}

export interface SavedSeasonLocalization {
  seasonId: string;
  language: string;
  name: string | null;
  overview: string | null;
}

export interface DetachedEpisodeRefs {
  files: Array<{ rowId: string; oldEpisodeId: string }>;
  playback: Array<{ rowId: string; oldEpisodeId: string }>;
  history: Array<{ rowId: string; oldEpisodeId: string }>;
  ratings: Array<{
    rowId: string;
    oldEpisodeId: string;
    oldSeasonId: string | null;
  }>;
}

export interface DetachedSeasonOnlyRating {
  rowId: string;
  oldSeasonId: string;
}

export interface TvdbEpisodePatch {
  stillPath?: string;
  voteAverage?: number;
  voteCount?: number;
  episodeType?: string;
  crew?: Array<{
    name: string;
    job: string;
    department?: string;
    profilePath?: string;
  }>;
  guestStars?: Array<{
    name: string;
    character?: string;
    profilePath?: string;
  }>;
}

export interface TvdbOverlayRepositoryPort {
  // ─── Reads (existing structure) ───
  findStructureWithEpisodes(mediaId: string): Promise<ExistingSeasonStructure[]>;

  // ─── Reads (existing translations) ───
  findEpisodeLocalizationsByEpisodeIds(
    episodeIds: string[],
  ): Promise<SavedEpisodeLocalization[]>;
  findSeasonLocalizationsBySeasonIds(
    seasonIds: string[],
  ): Promise<SavedSeasonLocalization[]>;

  // ─── Detach (read-then-null FK references) ───
  detachAndCollectEpisodeRefs(episodeIds: string[]): Promise<DetachedEpisodeRefs>;
  detachAndCollectSeasonOnlyRatings(
    seasonIds: string[],
  ): Promise<DetachedSeasonOnlyRating[]>;

  // ─── Replace structure + counts ───
  /**
   * Delete every season (and its cascading episodes) for `mediaId`, then run
   * `insertNewStructure` inside the same connection so the gap between the
   * old structure being gone and the new one being persisted is observed
   * atomically by other readers.
   */
  replaceSeasons(
    mediaId: string,
    insertNewStructure: () => Promise<void>,
  ): Promise<void>;
  updateMediaSeasonCounts(
    mediaId: string,
    numberOfSeasons: number,
    numberOfEpisodes: number,
  ): Promise<void>;

  // ─── Reattach (after the new structure is in place) ───
  reattachMediaFile(rowId: string, episodeId: string): Promise<void>;
  reattachUserPlayback(rowId: string, episodeId: string): Promise<void>;
  reattachUserWatchHistory(rowId: string, episodeId: string): Promise<void>;
  reattachUserRating(
    rowId: string,
    ids: { episodeId?: string; seasonId?: string },
  ): Promise<void>;

  // ─── TMDB overlay patches ───
  patchEpisode(id: string, patch: TvdbEpisodePatch): Promise<void>;
  patchSeasonVoteAverage(seasonId: string, voteAverage: number): Promise<void>;
}
