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
