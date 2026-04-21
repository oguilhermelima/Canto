import type { Database } from "@canto/db/client";
import {
  findMediaByIdWithSeasons,
  findUserMediaState,
  findUserPlaybackProgressByMedia,
  findUserWatchHistoryByMedia,
  upsertUserMediaState,
} from "../../../infrastructure/repositories";
import {
  isMediaType,
  isReleasedOnOrBefore,
  type MediaType,
  type TrackingStatus,
} from "../../rules/user-media-rules";

function normalizeStatus(value: string | null | undefined): TrackingStatus {
  if (
    value === "none" ||
    value === "planned" ||
    value === "watching" ||
    value === "completed" ||
    value === "dropped"
  ) {
    return value;
  }
  return "none";
}

function computePlaybackDrivenStatus(params: {
  mediaType: MediaType;
  history: Array<{ episodeId: string | null }>;
  playback: Array<{
    episodeId: string | null;
    isCompleted: boolean;
    positionSeconds: number;
  }>;
  releasedEpisodeIds: Set<string>;
}): TrackingStatus {
  if (params.mediaType === "movie") {
    const hasCompletedMovieWatch =
      params.history.some((entry) => entry.episodeId === null) ||
      params.playback.some(
        (entry) => entry.episodeId === null && entry.isCompleted,
      );
    if (hasCompletedMovieWatch) return "completed";

    const hasMovieProgress = params.playback.some(
      (entry) => entry.episodeId === null && entry.positionSeconds > 0,
    );
    return hasMovieProgress ? "watching" : "none";
  }

  const hasShowLevelCompletion = params.playback.some(
    (entry) => entry.episodeId === null && entry.isCompleted,
  );
  if (hasShowLevelCompletion) return "completed";

  const completedEpisodeIds = new Set<string>();
  for (const entry of params.history) {
    if (entry.episodeId && params.releasedEpisodeIds.has(entry.episodeId)) {
      completedEpisodeIds.add(entry.episodeId);
    }
  }

  for (const entry of params.playback) {
    if (
      entry.episodeId &&
      entry.isCompleted &&
      params.releasedEpisodeIds.has(entry.episodeId)
    ) {
      completedEpisodeIds.add(entry.episodeId);
    }
  }

  const hasEpisodeProgress = params.playback.some(
    (entry) =>
      !!entry.episodeId && !entry.isCompleted && entry.positionSeconds > 0,
  );

  const hasShowLevelProgress = params.playback.some(
    (entry) => entry.episodeId === null && entry.positionSeconds > 0,
  );

  if (
    params.releasedEpisodeIds.size > 0 &&
    completedEpisodeIds.size >= params.releasedEpisodeIds.size
  ) {
    return "completed";
  }

  if (
    completedEpisodeIds.size > 0 ||
    hasEpisodeProgress ||
    hasShowLevelProgress
  ) {
    return "watching";
  }

  return "none";
}

function resolvePromotion(
  currentStatus: TrackingStatus,
  computedStatus: TrackingStatus,
): TrackingStatus | null {
  if (currentStatus === "dropped") return null;
  if (computedStatus === "completed" && currentStatus !== "completed") {
    return "completed";
  }
  if (
    computedStatus === "watching" &&
    (currentStatus === "none" || currentStatus === "planned")
  ) {
    return "watching";
  }
  return null;
}

export async function promoteUserMediaStateFromPlayback(
  db: Database,
  params: { userId: string; mediaId: string },
): Promise<TrackingStatus | null> {
  const mediaRow = await findMediaByIdWithSeasons(db, params.mediaId);
  if (!mediaRow) return null;

  if (!isMediaType(mediaRow.type)) return null;
  const mediaType: MediaType = mediaRow.type;

  const [currentState, historyRows, playbackRows] = await Promise.all([
    findUserMediaState(db, params.userId, params.mediaId),
    findUserWatchHistoryByMedia(db, params.userId, params.mediaId),
    findUserPlaybackProgressByMedia(db, params.userId, params.mediaId),
  ]);

  const now = new Date();
  const releasedEpisodeIds = new Set(
    mediaRow.seasons
      .flatMap((season) => season.episodes)
      .filter((episode) => isReleasedOnOrBefore(episode.airDate, now))
      .map((episode) => episode.id),
  );

  const computedStatus = computePlaybackDrivenStatus({
    mediaType,
    history: historyRows.map((entry) => ({ episodeId: entry.episodeId })),
    playback: playbackRows.map((entry) => ({
      episodeId: entry.episodeId ?? null,
      isCompleted: entry.isCompleted,
      positionSeconds: entry.positionSeconds,
    })),
    releasedEpisodeIds,
  });

  const promotedStatus = resolvePromotion(
    normalizeStatus(currentState?.status),
    computedStatus,
  );

  if (!promotedStatus) return null;

  await upsertUserMediaState(db, {
    userId: params.userId,
    mediaId: params.mediaId,
    status: promotedStatus,
  });

  return promotedStatus;
}
