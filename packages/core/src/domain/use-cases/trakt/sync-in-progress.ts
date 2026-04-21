import { findEpisodeIdByMediaAndNumbers } from "../../../infrastructure/repositories";
import { upsertUserPlaybackProgress } from "../../../infrastructure/repositories/user-media";
import {
  listTraktPlaybackProgress,
  type TraktPlaybackProgressRef,
} from "../../../infrastructure/adapters/trakt/client";
import {
  parseDateOrNow,
  resolveMediaFromTraktRef,
  type SyncContext,
} from "./shared";

const COMPLETION_THRESHOLD = 95;

function computePositionSeconds(
  progressPercent: number,
  runtimeMinutes: number | null,
): number {
  if (!runtimeMinutes || runtimeMinutes <= 0) return 0;
  const clamped = Math.max(0, Math.min(progressPercent, 100));
  return Math.round((clamped / 100) * runtimeMinutes * 60);
}

export async function pullInProgress(ctx: SyncContext): Promise<void> {
  const remoteRows = await listTraktPlaybackProgress(ctx.accessToken);
  if (remoteRows.length === 0) return;

  const resolveCache = new Map<string, string | null>();

  for (const remote of remoteRows) {
    const ref: TraktPlaybackProgressRef = remote;
    const mediaId = await resolveMediaFromTraktRef(
      ctx.db,
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
      episodeId = await findEpisodeIdByMediaAndNumbers(
        ctx.db,
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

    await upsertUserPlaybackProgress(ctx.db, {
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
