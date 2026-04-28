import type { Database } from "@canto/db/client";
import {
  findMediaByIdWithSeasons,
  findUserMediaState,
  findUserPlaybackProgressByMedia,
  findUserWatchHistoryByMedia,
  upsertUserMediaState,
} from "../../../infra/repositories";
import {
  isMediaType,
  isReleasedOnOrBefore,
  type MediaType,
  type TrackingStatus,
} from "../rules/user-media-rules";

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

/** Pick the most recent real event time across the playback + history rows
 *  for this media. We use this as the `updatedAt` of the promoted state row
 *  so the library "Completed" tab orders Trakt-imported items by when the
 *  user actually finished them, not by when our sync happened to run. */
function latestEventTimestamp(
  history: Array<{ watchedAt: Date | null | undefined }>,
  playback: Array<{ lastWatchedAt: Date | null | undefined }>,
): Date | null {
  let best: Date | null = null;
  const consider = (t: Date | null | undefined) => {
    if (!t) return;
    if (!best || t.getTime() > best.getTime()) best = t;
  };
  for (const h of history) consider(h.watchedAt);
  for (const p of playback) consider(p.lastWatchedAt);
  return best;
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

  const currentStatus = normalizeStatus(currentState?.status);
  const promotedStatus = resolvePromotion(currentStatus, computedStatus);

  const eventAt = latestEventTimestamp(
    historyRows.map((r) => ({ watchedAt: r.watchedAt })),
    playbackRows.map((r) => ({ lastWatchedAt: r.lastWatchedAt })),
  );

  // We always upsert when an `eventAt` exists, even if the status didn't
  // transition. Reason: the promoter is also the place that backfills the
  // state row's `updatedAt` from the real watched timestamp. A user with
  // 1800 already-promoted rows still needs each row's `updatedAt` moved to
  // the corresponding Trakt `last_watched_at` so library sort and
  // recently-completed feeds are honest. The upsert is a no-op for status
  // (we write whatever's effective today), and `upsertUserMediaState` uses
  // GREATEST(updatedAt, incoming) so this can never pull the timestamp
  // backward when the user did something later locally.
  if (!promotedStatus && !eventAt) return null;

  // Effective status: keep what the row has if no transition; otherwise
  // apply the promotion. Never write a status weaker than what's stored.
  const effectiveStatus =
    promotedStatus ?? (currentStatus === "none" ? null : currentStatus);

  await upsertUserMediaState(db, {
    userId: params.userId,
    mediaId: params.mediaId,
    status: effectiveStatus,
    updatedAt: eventAt ?? now,
  });

  return promotedStatus;
}
