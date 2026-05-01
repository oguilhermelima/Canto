import type {
  CompletedPlaybackEpisodeRow,
  ContinueWatchingFeedQuery,
  ContinueWatchingFeedRow,
  EpisodeByMediaRow,
  LibraryFeedFilterOptions,
  LibraryGenre,
  UserListMediaCandidateRow,
  UserMediaCounts,
  UserMediaPaginatedPage,
  UserMediaPaginatedQuery,
  UserMediaStateByMediaRow,
  UserPlaybackProgressFeedRow,
  UserWatchHistoryByMediaRow,
  UserWatchHistoryFeedRow,
  WatchingShowMetadataRow,
} from "@canto/core/domain/user-media/types/library-feed";

/**
 * Read-only port covering the library-feed and watch-next surface: the wide
 * SELECT queries that drive the Continue Watching / Library History /
 * Upcoming Schedule / Watch Next rails plus the library tab itself.
 *
 * All methods are pure reads — projections that JOIN media + localization +
 * (optionally) episode metadata into denormalized rows ready for the feed
 * use cases. The adapter wraps the existing infra helpers in
 * `infra/user-media/{library-feed,watch-history,playback-progress,state}-repository`.
 */
export interface LibraryFeedRepositoryPort {
  /**
   * Continue Watching rail — keyset-paginated on (lastWatchedAt DESC, id DESC).
   * Pre-filtered to `source IN ('jellyfin','plex','trakt')`, `isCompleted=false`,
   * `positionSeconds > 0`, `lastWatchedAt IS NOT NULL`. Trailer keys are
   * batched separately via `MediaExtrasRepositoryPort`.
   */
  findContinueWatchingFeed(
    userId: string,
    language: string,
    query: ContinueWatchingFeedQuery,
  ): Promise<ContinueWatchingFeedRow[]>;

  /**
   * Library history — playback-progress projection used by the timeline view.
   * Returns every progress row regardless of source so the caller can decide
   * what counts as completed vs in-progress.
   */
  findUserPlaybackProgressFeed(
    userId: string,
    language: string,
    mediaType: "movie" | "show" | undefined,
    filters: LibraryFeedFilterOptions | undefined,
  ): Promise<UserPlaybackProgressFeedRow[]>;

  /**
   * Library history — watch-history projection. Bounded by `limit` so the
   * caller can over-fetch, then re-rank with playback rows in JS.
   */
  findUserWatchHistoryFeed(
    userId: string,
    language: string,
    limit: number,
    mediaType: "movie" | "show" | undefined,
    filters: LibraryFeedFilterOptions | undefined,
  ): Promise<UserWatchHistoryFeedRow[]>;

  /**
   * Watchlist + custom-list candidates — the "from list" axis of the
   * Upcoming / Watch Next feeds. Optional `limit` truncates at the source
   * so JS-side ranking stays bounded.
   */
  findUserListMediaCandidates(
    userId: string,
    language: string,
    mediaType: "movie" | "show" | undefined,
    limit: number | undefined,
  ): Promise<UserListMediaCandidateRow[]>;

  /**
   * Library tab paginated grid — `userMediaState` left-joined with media +
   * localization. Returns total count alongside the page slice.
   */
  findUserMediaPaginated(
    userId: string,
    language: string,
    query: UserMediaPaginatedQuery,
  ): Promise<UserMediaPaginatedPage>;

  /** Tab counters for the library shell — aggregated counts in one round-trip. */
  findUserMediaCounts(userId: string): Promise<UserMediaCounts>;

  /** Distinct genres derived from media the user has any activity for. */
  findLibraryGenres(userId: string): Promise<LibraryGenre[]>;

  /**
   * Episode metadata for a set of media (localized title + air date). Used
   * to compute next-episode candidates and upcoming schedules.
   */
  findEpisodesByMediaIds(
    mediaIds: string[],
    language: string,
  ): Promise<EpisodeByMediaRow[]>;

  /** Watch history rows scoped to a set of media — feeds dedupe + rank. */
  findUserWatchHistoryByMediaIds(
    userId: string,
    mediaIds: string[],
  ): Promise<UserWatchHistoryByMediaRow[]>;

  /**
   * Completed playback rows (movies only meaningfully — episode-level still
   * surfaces episodeId). Supplements watch history when the source writes to
   * playback_progress only (Jellyfin/Plex).
   */
  findUserCompletedPlaybackByMediaIds(
    userId: string,
    mediaIds: string[],
  ): Promise<CompletedPlaybackEpisodeRow[]>;

  /**
   * MediaIds that should appear on Continue Watching for this user — used by
   * Watch Next to exclude items already covered by the other rail.
   */
  findUserContinueWatchingMediaIds(
    userId: string,
    mediaType: "movie" | "show" | undefined,
  ): Promise<Set<string>>;

  /**
   * Show-typed media the user has any playback activity for. Optional limit
   * over-fetches by 2x to leave room for the dedupe pass at the call site.
   */
  findUserWatchingShowsMetadata(
    userId: string,
    language: string,
    limit: number | undefined,
  ): Promise<WatchingShowMetadataRow[]>;

  /** `userMediaState` rows scoped to a set of media — drives status filters. */
  findUserMediaStatesByMediaIds(
    userId: string,
    mediaIds: string[],
  ): Promise<UserMediaStateByMediaRow[]>;
}
