export type UserRatingId = string & { readonly __brand: "UserRatingId" };

/**
 * Per-(user, media, season?, episode?) rating row. `seasonId` and
 * `episodeId` together form the rating scope:
 * - both null → media-level
 * - season set, episode null → season-level
 * - both set → episode-level
 *
 * `isOverride=true` means the user explicitly set this rating; `false` means
 * it was computed (e.g. season avg from episodes, media avg from seasons).
 */
export interface UserRating {
  id: UserRatingId;
  userId: string;
  mediaId: string;
  seasonId: string | null;
  episodeId: string | null;
  rating: number;
  comment: string | null;
  isOverride: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertUserRatingInput {
  userId: string;
  mediaId: string;
  seasonId?: string | null;
  episodeId?: string | null;
  rating: number;
  comment?: string | null;
  isOverride?: boolean;
  /** Real event time (Trakt's `rated_at`). When provided, the row's stored
   *  `updatedAt` is moved to GREATEST(stored, incoming). Defaults to `now()`. */
  ratedAt?: Date;
}

/** Community review projection — userRating + author info from `user`. */
export interface CommunityReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  seasonId: string | null;
  episodeId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  user: { id: string; name: string | null; image: string | null };
}
