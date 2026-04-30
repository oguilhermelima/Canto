/** Per-(user, media) state row tracking watching/completed/dropped status,
 *  rating, favorite, and hidden flags. Composite PK on (userId, mediaId). */
export type UserMediaStatus =
  | "none"
  | "planned"
  | "watching"
  | "completed"
  | "dropped";

export interface UserMediaState {
  userId: string;
  mediaId: string;
  status: UserMediaStatus | null;
  rating: number | null;
  isFavorite: boolean;
  isHidden: boolean;
  updatedAt: Date;
}

/** Patch shape for `upsertState`. `updatedAt` semantics: when the caller
 *  provides one (Trakt sync passing the real remote timestamp), the row's
 *  stored `updatedAt` is moved to GREATEST(stored, incoming) so an
 *  out-of-order replay can never pull the timestamp backward. Omitted →
 *  defaults to `now()`. */
export interface UpsertUserMediaStateInput {
  userId: string;
  mediaId: string;
  status?: UserMediaStatus | null;
  rating?: number | null;
  isFavorite?: boolean;
  isHidden?: boolean;
  updatedAt?: Date;
}

/** Slim projection used by recs / list reads. */
export interface UserMediaStateByMediaRow {
  mediaId: string;
  status: string | null;
  rating: number | null;
  updatedAt: Date;
}

/** All non-neutral states: row has a status, rating, or favorite flag set.
 *  Used by recs rebuild to weight seeds by engagement. */
export interface UserEngagementStateRow {
  mediaId: string;
  status: string | null;
  rating: number | null;
  isFavorite: boolean;
  updatedAt: Date;
}

export interface RecentlyCompletedMediaRow {
  mediaId: string;
  title: string;
  posterPath: string | null;
  type: "movie" | "show";
  completedAt: Date;
}
