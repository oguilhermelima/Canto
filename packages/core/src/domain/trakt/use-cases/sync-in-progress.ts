import type { TraktApiPort } from "@canto/core/domain/trakt/ports/trakt-api.port";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { TraktPlaybackProgressRef } from "@canto/core/domain/trakt/types/trakt-api";
import {
  parseDateOrNow,
  resolveMediaFromTraktRef,
  type ResolveMediaDeps,
  type SyncContext,
} from "@canto/core/domain/trakt/use-cases/shared";

export interface SyncInProgressDeps extends ResolveMediaDeps {
  traktApi: TraktApiPort;
  userMedia: UserMediaRepositoryPort;
}

const COMPLETION_THRESHOLD = 95;

function computePositionSeconds(
  progressPercent: number,
  runtimeMinutes: number | null,
): number {
  if (!runtimeMinutes || runtimeMinutes <= 0) return 0;
  const clamped = Math.max(0, Math.min(progressPercent, 100));
  return Math.round((clamped / 100) * runtimeMinutes * 60);
}

export async function pullInProgress(
  ctx: SyncContext,
  deps: SyncInProgressDeps,
): Promise<void> {
  const remoteRows = await deps.traktApi.listPlaybackProgress(ctx.accessToken);
  if (remoteRows.length === 0) return;

  const resolveCache = new Map<string, string | null>();

  for (const remote of remoteRows) {
    const ref: TraktPlaybackProgressRef = remote;
    const mediaId = await resolveMediaFromTraktRef(
      ctx.db,
      deps,
      {
        type: ref.type,
        ids: ref.ids,
        seasonNumber: ref.seasonNumber,
        episodeNumber: ref.episodeNumber,
      },
      resolveCache,
    );
    if (!mediaId) continue;

    let episodeId: string | null = null;
    if (
      ref.type === "show" &&
      typeof ref.seasonNumber === "number" &&
      typeof ref.episodeNumber === "number"
    ) {
      episodeId = await deps.media.findEpisodeIdByMediaAndNumbers(
        mediaId,
        ref.seasonNumber,
        ref.episodeNumber,
      );
      if (!episodeId) continue;
    }

    const lastWatchedAt = parseDateOrNow(ref.pausedAt, ctx.now);
    const positionSeconds = computePositionSeconds(
      ref.progressPercent,
      ref.runtimeMinutes,
    );
    const isCompleted = ref.progressPercent >= COMPLETION_THRESHOLD;

    await deps.userMedia.upsertPlayback({
      userId: ctx.userId,
      mediaId,
      episodeId,
      positionSeconds,
      isCompleted,
      lastWatchedAt,
      source: "trakt",
    });
  }
}
