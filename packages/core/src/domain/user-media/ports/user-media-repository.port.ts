import type {
  HideMediaInput,
  UnhideMediaInput,
  UserHiddenMedia,
  UserHiddenMediaRef,
} from "@canto/core/domain/user-media/types/user-hidden-media";
import type {
  NewUserMediaLibrary,
  UserMediaLibrary,
} from "@canto/core/domain/user-media/types/user-media-library";
import type {
  RecentlyCompletedMediaRow,
  UpsertUserMediaStateInput,
  UserEngagementStateRow,
  UserMediaState,
  UserMediaStateByMediaRow,
} from "@canto/core/domain/user-media/types/user-media-state";
import type {
  CompletedPlaybackEpisodeRow,
  UpsertPlaybackResult,
  UpsertUserPlaybackProgressInput,
  UserPlaybackProgress,
} from "@canto/core/domain/user-media/types/user-playback-progress";
import type {
  CommunityReview,
  UpsertUserRatingInput,
  UserRating,
} from "@canto/core/domain/user-media/types/user-rating";
import type {
  EpisodeByMediaRow,
  NewUserWatchHistory,
  UserWatchHistory,
  UserWatchHistoryByMediaRow,
} from "@canto/core/domain/user-media/types/user-watch-history";

/**
 * Single port covering the six user-media tables — `user_media_state`,
 * `user_watch_history`, `user_rating`, `user_playback_progress`,
 * `user_media_library`, `user_hidden_media`. The cascade rating helpers
 * (`computeAndSync*`) live here too because they're coordinated writes
 * across `userRating` + `userMediaState`.
 *
 * Heavy aggregating reads (library feed, profile insights, watch-time
 * stats, paginated library) intentionally stay as direct repo calls in
 * `infra/user-media/library-feed-repository`, `stats-repository`, and
 * `profile-insights-repository`. They cross context boundaries (media,
 * episode, season) and need a separate design pass when the media wave
 * runs.
 */
export interface UserMediaRepositoryPort {
  // ── State ──

  findState(userId: string, mediaId: string): Promise<UserMediaState | null>;
  upsertState(input: UpsertUserMediaStateInput): Promise<UserMediaState>;
  findStatesByMediaIds(
    userId: string,
    mediaIds: string[],
  ): Promise<UserMediaStateByMediaRow[]>;
  findEngagementStates(userId: string): Promise<UserEngagementStateRow[]>;
  /**
   * `(externalId, provider)` pairs for media the user has explicitly
   * disliked (status='dropped' or rating ≤ 3). Used by the recommendations
   * exclusion set builder to ensure negative-signal items never resurface.
   */
  findNegativeSignalExternalIds(
    userId: string,
  ): Promise<Array<{ externalId: number; provider: string }>>;
  findRecentlyCompletedMedia(
    userId: string,
    language: string,
    mediaType: "movie" | "show" | undefined,
    limit: number,
  ): Promise<RecentlyCompletedMediaRow[]>;

  // ── Watch History ──

  addHistoryEntry(input: NewUserWatchHistory): Promise<UserWatchHistory>;
  findHistory(
    userId: string,
    mediaId: string,
    episodeId?: string | null,
  ): Promise<UserWatchHistory[]>;
  findHistoryByMedia(userId: string, mediaId: string): Promise<UserWatchHistory[]>;
  findHistoryByMediaIds(
    userId: string,
    mediaIds: string[],
  ): Promise<UserWatchHistoryByMediaRow[]>;
  deleteHistoryByIds(
    userId: string,
    mediaId: string,
    entryIds: string[],
  ): Promise<{ count: number; episodeIds: (string | null)[] }>;
  findEpisodesByMediaIds(
    mediaIds: string[],
    language: string,
  ): Promise<EpisodeByMediaRow[]>;

  // ── Rating ──

  upsertRating(input: UpsertUserRatingInput): Promise<UserRating>;
  findRating(
    userId: string,
    mediaId: string,
    seasonId?: string | null,
    episodeId?: string | null,
  ): Promise<UserRating | null>;
  findRatingsByMedia(userId: string, mediaId: string): Promise<UserRating[]>;
  deleteRating(
    userId: string,
    mediaId: string,
    seasonId?: string | null,
    episodeId?: string | null,
  ): Promise<void>;
  /** Cascade: re-derive season rating from episode ratings, then bubble up
   *  to media rating + sync to userMediaState.rating. Skipped when a user-
   *  override exists at any level. */
  computeAndSyncSeasonRating(
    userId: string,
    mediaId: string,
    seasonId: string,
  ): Promise<void>;
  /** Cascade: re-derive media rating from season ratings (or episodes if no
   *  season ratings), then sync to userMediaState.rating. */
  computeAndSyncMediaRating(userId: string, mediaId: string): Promise<void>;
  findMediaReviews(
    mediaId: string,
    opts?: {
      limit?: number;
      offset?: number;
      episodeId?: string;
      sortBy?: "date" | "rating";
    },
  ): Promise<{ reviews: CommunityReview[]; total: number }>;
  findReviewById(reviewId: string): Promise<CommunityReview | null>;
  findEpisodeRatingsFromAllUsers(
    episodeId: string,
  ): Promise<
    Array<{
      id: string;
      rating: number;
      comment: string | null;
      createdAt: Date;
      user: { id: string; name: string | null; image: string | null };
    }>
  >;

  // ── Playback Progress ──

  findPlayback(
    userId: string,
    mediaId: string,
    episodeId?: string | null,
  ): Promise<UserPlaybackProgress | null>;
  findPlaybackByMedia(
    userId: string,
    mediaId: string,
  ): Promise<UserPlaybackProgress[]>;
  upsertPlayback(
    input: UpsertUserPlaybackProgressInput,
  ): Promise<UpsertPlaybackResult>;
  findDistinctPlaybackMediaPairs(
    userId?: string,
  ): Promise<Array<{ userId: string; mediaId: string }>>;
  softDeletePlayback(
    userId: string,
    mediaId: string,
    episodeIds: (string | null)[],
  ): Promise<number>;
  findCompletedPlaybackByMediaIds(
    userId: string,
    mediaIds: string[],
  ): Promise<CompletedPlaybackEpisodeRow[]>;
  findContinueWatchingMediaIds(
    userId: string,
    mediaType?: "movie" | "show",
  ): Promise<Set<string>>;

  // ── Library ──

  addToLibrary(input: NewUserMediaLibrary): Promise<UserMediaLibrary>;
  isInLibrary(userId: string, mediaId: string): Promise<boolean>;
  findLibraryMediaIds(userId: string): Promise<string[]>;
  pruneStaleLibrary(
    userId: string,
    source: "jellyfin" | "plex",
    syncRunStart: Date,
  ): Promise<number>;
  findExistingLibraryMediaIds(
    userId: string,
    mediaIds: string[],
  ): Promise<Set<string>>;

  // ── Hidden ──

  hide(input: HideMediaInput): Promise<void>;
  unhide(input: UnhideMediaInput): Promise<void>;
  findHiddenIds(userId: string): Promise<UserHiddenMediaRef[]>;
  findHiddenPaginated(
    userId: string,
    params: { limit: number; offset: number },
  ): Promise<{ items: UserHiddenMedia[]; total: number }>;
}
