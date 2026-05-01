import type { Database } from "@canto/db/client";
import type { LibraryFeedRepositoryPort } from "@canto/core/domain/user-media/ports/library-feed-repository.port";
import {
  findContinueWatchingFeed,
  findLibraryGenres,
  findUserListMediaCandidates,
  findUserMediaCounts,
  findUserMediaPaginated,
  findUserPlaybackProgressFeed,
  findUserWatchHistoryFeed,
} from "@canto/core/infra/user-media/library-feed-repository";
import {
  findEpisodesByMediaIds,
  findUserWatchHistoryByMediaIds,
} from "@canto/core/infra/user-media/watch-history-repository";
import {
  findUserCompletedPlaybackByMediaIds,
  findUserContinueWatchingMediaIds,
  findUserWatchingShowsMetadata,
} from "@canto/core/infra/user-media/playback-progress-repository";
import { findUserMediaStatesByMediaIds } from "@canto/core/infra/user-media/state-repository";

export function makeLibraryFeedRepository(
  db: Database,
): LibraryFeedRepositoryPort {
  return {
    findContinueWatchingFeed: (userId, language, query) =>
      findContinueWatchingFeed(db, userId, language, query),
    findUserPlaybackProgressFeed: (userId, language, mediaType, filters) =>
      findUserPlaybackProgressFeed(db, userId, language, mediaType, filters),
    findUserWatchHistoryFeed: (userId, language, limit, mediaType, filters) =>
      findUserWatchHistoryFeed(db, userId, language, limit, mediaType, filters),
    findUserListMediaCandidates: (userId, language, mediaType, limit) =>
      findUserListMediaCandidates(db, userId, language, mediaType, limit),
    findUserMediaPaginated: (userId, language, query) =>
      findUserMediaPaginated(db, userId, language, query),
    findUserMediaCounts: (userId) => findUserMediaCounts(db, userId),
    findLibraryGenres: (userId) => findLibraryGenres(db, userId),
    findEpisodesByMediaIds: (mediaIds, language) =>
      findEpisodesByMediaIds(db, mediaIds, language),
    findUserWatchHistoryByMediaIds: (userId, mediaIds) =>
      findUserWatchHistoryByMediaIds(db, userId, mediaIds),
    findUserCompletedPlaybackByMediaIds: (userId, mediaIds) =>
      findUserCompletedPlaybackByMediaIds(db, userId, mediaIds),
    findUserContinueWatchingMediaIds: (userId, mediaType) =>
      findUserContinueWatchingMediaIds(db, userId, mediaType),
    findUserWatchingShowsMetadata: (userId, language, limit) =>
      findUserWatchingShowsMetadata(db, userId, language, limit),
    findUserMediaStatesByMediaIds: (userId, mediaIds) =>
      findUserMediaStatesByMediaIds(db, userId, mediaIds),
  };
}
