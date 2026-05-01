export type UserWatchHistoryId = string
  & { readonly __brand: "UserWatchHistoryId" };

/**
 * Append-only watch event. One row per `userMediaState` view of "I watched
 * this episode at this timestamp". Soft-deleted via `deletedAt`.
 */
export interface UserWatchHistory {
  id: UserWatchHistoryId;
  userId: string;
  mediaId: string;
  episodeId: string | null;
  watchedAt: Date;
  source: string | null;
  deletedAt: Date | null;
}

export interface NewUserWatchHistory {
  userId: string;
  mediaId: string;
  episodeId?: string | null;
  watchedAt?: Date;
  source?: string | null;
}

/** Slim projection used by reverse-sync + Trakt-sync history flows. */
export interface UserWatchHistoryByMediaRow {
  id: string;
  mediaId: string;
  episodeId: string | null;
  watchedAt: Date;
  source: string | null;
}

/** Episode lookup row used to map history to season/episode metadata. */
export interface EpisodeByMediaRow {
  mediaId: string;
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle: string | null;
  airDate: string | null;
}

/** Watch-history row joined with media + episode + season identifiers used by
 *  the Trakt push flow. `seasonNumber` and `episodeNumber` are non-null only
 *  when the history entry has an `episodeId` (show plays); movie plays leave
 *  them null. */
export interface UserWatchHistoryPushRow {
  id: string;
  mediaId: string;
  watchedAt: Date;
  type: string;
  provider: string;
  externalId: number;
  imdbId: string | null;
  tvdbId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}
