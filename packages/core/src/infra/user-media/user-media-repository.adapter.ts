import type { Database } from "@canto/db/client";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import {
  findHiddenIds,
  findHiddenMediaPaginated,
  hideMedia,
  unhideMedia,
} from "@canto/core/infra/user-media/hidden-repository";
import {
  addToUserMediaLibrary,
  findExistingUserLibraryMediaIds,
  findUserMediaLibraryIds,
  isInUserMediaLibrary,
  pruneStaleUserMediaLibrary,
} from "@canto/core/infra/user-media/library-repository";
import {
  findDistinctPlaybackMediaPairs,
  findUserCompletedPlaybackByMediaIds,
  findUserContinueWatchingMediaIds,
  findUserPlaybackProgress,
  findUserPlaybackProgressByMedia,
  softDeleteUserPlaybackProgress,
  upsertUserPlaybackProgress,
} from "@canto/core/infra/user-media/playback-progress-repository";
import {
  computeAndSyncMediaRating,
  computeAndSyncSeasonRating,
  deleteUserRating,
  findEpisodeRatingsFromAllUsers,
  findMediaReviews,
  findReviewById,
  findUserOverrideRatingsForSync,
  findUserRating,
  findUserRatingsByMedia,
  upsertUserRating,
} from "@canto/core/infra/user-media/rating-repository";
import {
  findRecentlyCompletedMedia,
  findUserEngagementStates,
  findUserFavoritesForSync,
  findUserMediaState,
  findUserMediaStatesByMediaIds,
  findUserNegativeSignalExternalIds,
  upsertUserMediaState,
} from "@canto/core/infra/user-media/state-repository";
import {
  addUserWatchHistory,
  deleteUserWatchHistoryByIds,
  findEpisodesByMediaIds,
  findUnpushedWatchHistoryForTrakt,
  findUserWatchHistory,
  findUserWatchHistoryByExactWatch,
  findUserWatchHistoryByMedia,
  findUserWatchHistoryByMediaIds,
} from "@canto/core/infra/user-media/watch-history-repository";
import { toDomain as hiddenToDomain } from "@canto/core/infra/user-media/user-hidden-media.mapper";
import {
  toDomain as libraryToDomain,
  toRow as libraryToRow,
} from "@canto/core/infra/user-media/user-media-library.mapper";
import {
  toDomain as stateToDomain,
  toRow as stateToRow,
} from "@canto/core/infra/user-media/user-media-state.mapper";
import {
  toDomain as playbackToDomain,
} from "@canto/core/infra/user-media/user-playback-progress.mapper";
import { toDomain as ratingToDomain } from "@canto/core/infra/user-media/user-rating.mapper";
import {
  toDomain as historyToDomain,
  toRow as historyToRow,
} from "@canto/core/infra/user-media/user-watch-history.mapper";

export function makeUserMediaRepository(db: Database): UserMediaRepositoryPort {
  return {
    // ── State ──
    findState: async (userId, mediaId) => {
      const row = await findUserMediaState(db, userId, mediaId);
      return row ? stateToDomain(row) : null;
    },
    upsertState: async (input) => {
      const row = await upsertUserMediaState(db, stateToRow(input));
      // upsertUserMediaState returns the inserted/updated row; the
      // .returning() can theoretically return undefined on conflict-no-op,
      // but our SET clause always writes so we get a row back.
      if (!row) throw new Error("upsertUserMediaState returned no row");
      return stateToDomain(row);
    },
    findStatesByMediaIds: (userId, mediaIds) =>
      findUserMediaStatesByMediaIds(db, userId, mediaIds),
    findEngagementStates: (userId) => findUserEngagementStates(db, userId),
    findNegativeSignalExternalIds: (userId) =>
      findUserNegativeSignalExternalIds(db, userId),
    findRecentlyCompletedMedia: (userId, language, mediaType, limit) =>
      findRecentlyCompletedMedia(db, userId, language, mediaType, limit),
    findFavoritesForSync: (userId) => findUserFavoritesForSync(db, userId),

    // ── Watch History ──
    addHistoryEntry: async (input) => {
      const row = await addUserWatchHistory(db, historyToRow(input));
      if (!row) throw new Error("addHistoryEntry: insert returned no row");
      return historyToDomain(row);
    },
    findHistory: async (userId, mediaId, episodeId) => {
      const rows = await findUserWatchHistory(db, userId, mediaId, episodeId ?? null);
      return rows.map(historyToDomain);
    },
    findHistoryByMedia: async (userId, mediaId) => {
      const rows = await findUserWatchHistoryByMedia(db, userId, mediaId);
      return rows.map(historyToDomain);
    },
    findHistoryByMediaIds: (userId, mediaIds) =>
      findUserWatchHistoryByMediaIds(db, userId, mediaIds),
    deleteHistoryByIds: (userId, mediaId, entryIds) =>
      deleteUserWatchHistoryByIds(db, userId, mediaId, entryIds),
    findEpisodesByMediaIds: (mediaIds, language) =>
      findEpisodesByMediaIds(db, mediaIds, language),
    findHistoryByExactWatch: async (userId, mediaId, episodeId, watchedAt) => {
      const row = await findUserWatchHistoryByExactWatch(
        db,
        userId,
        mediaId,
        episodeId,
        watchedAt,
      );
      return row ? historyToDomain(row) : null;
    },
    findUnpushedHistoryForTrakt: (userId, limit) =>
      findUnpushedWatchHistoryForTrakt(db, userId, limit),

    // ── Rating ──
    upsertRating: async (input) => {
      const row = await upsertUserRating(db, input);
      return ratingToDomain(row);
    },
    findRating: async (userId, mediaId, seasonId, episodeId) => {
      const row = await findUserRating(
        db,
        userId,
        mediaId,
        seasonId ?? null,
        episodeId ?? null,
      );
      return row ? ratingToDomain(row) : null;
    },
    findRatingsByMedia: async (userId, mediaId) => {
      const rows = await findUserRatingsByMedia(db, userId, mediaId);
      return rows.map(ratingToDomain);
    },
    deleteRating: (userId, mediaId, seasonId, episodeId) =>
      deleteUserRating(db, userId, mediaId, seasonId ?? null, episodeId ?? null),
    computeAndSyncSeasonRating: (userId, mediaId, seasonId) =>
      computeAndSyncSeasonRating(db, userId, mediaId, seasonId),
    computeAndSyncMediaRating: (userId, mediaId) =>
      computeAndSyncMediaRating(db, userId, mediaId),
    findMediaReviews: (mediaId, opts) => findMediaReviews(db, mediaId, opts),
    findReviewById: (reviewId) => findReviewById(db, reviewId),
    findEpisodeRatingsFromAllUsers: (episodeId) =>
      findEpisodeRatingsFromAllUsers(db, episodeId),
    findOverrideRatingsForSync: (userId) =>
      findUserOverrideRatingsForSync(db, userId),

    // ── Playback Progress ──
    findPlayback: async (userId, mediaId, episodeId) => {
      const row = await findUserPlaybackProgress(
        db,
        userId,
        mediaId,
        episodeId ?? null,
      );
      return row ? playbackToDomain(row) : null;
    },
    findPlaybackByMedia: async (userId, mediaId) => {
      const rows = await findUserPlaybackProgressByMedia(db, userId, mediaId);
      return rows.map(playbackToDomain);
    },
    upsertPlayback: async (input) => {
      const result = await upsertUserPlaybackProgress(db, {
        userId: input.userId,
        mediaId: input.mediaId,
        episodeId: input.episodeId ?? null,
        positionSeconds: input.positionSeconds ?? 0,
        isCompleted: input.isCompleted ?? false,
        lastWatchedAt: input.lastWatchedAt ?? null,
        source: input.source ?? null,
      });
      return {
        row: result.row ? playbackToDomain(result.row) : undefined,
        previous: result.previous,
      };
    },
    findDistinctPlaybackMediaPairs: (userId) =>
      findDistinctPlaybackMediaPairs(db, userId),
    softDeletePlayback: (userId, mediaId, episodeIds) =>
      softDeleteUserPlaybackProgress(db, userId, mediaId, episodeIds),
    findCompletedPlaybackByMediaIds: (userId, mediaIds) =>
      findUserCompletedPlaybackByMediaIds(db, userId, mediaIds),
    findContinueWatchingMediaIds: (userId, mediaType) =>
      findUserContinueWatchingMediaIds(db, userId, mediaType),

    // ── Library ──
    addToLibrary: async (input) => {
      const row = await addToUserMediaLibrary(db, libraryToRow(input));
      if (!row) throw new Error("addToLibrary: insert returned no row");
      return libraryToDomain(row);
    },
    isInLibrary: (userId, mediaId) => isInUserMediaLibrary(db, userId, mediaId),
    findLibraryMediaIds: (userId) => findUserMediaLibraryIds(db, userId),
    pruneStaleLibrary: (userId, source, syncRunStart) =>
      pruneStaleUserMediaLibrary(db, userId, source, syncRunStart),
    findExistingLibraryMediaIds: (userId, mediaIds) =>
      findExistingUserLibraryMediaIds(db, userId, mediaIds),

    // ── Hidden ──
    hide: async (input) => {
      await hideMedia(db, input);
    },
    unhide: async (input) => {
      await unhideMedia(db, input);
    },
    findHiddenIds: async (userId) => {
      const rows = await findHiddenIds(db, userId);
      return rows;
    },
    findHiddenPaginated: async (userId, params) => {
      const result = await findHiddenMediaPaginated(db, userId, params);
      return {
        items: result.items.map(hiddenToDomain),
        total: result.total,
      };
    },
  };
}
