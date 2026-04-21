import type { Database } from "@canto/db/client";
import {
  findUserMediaState,
  findUserPlaybackProgress,
} from "../../../infrastructure/repositories";

export interface UserMediaStateResponse {
  mediaId: string;
  trackingStatus: string;
  rating: number | null;
  isFavorite: boolean;
  isHidden: boolean;
  progress: number;
  isCompleted: boolean;
  lastWatchedAt: Date | null;
  source: string | null;
}

export async function getUserMediaState(
  db: Database,
  userId: string,
  mediaId: string,
): Promise<UserMediaStateResponse> {
  const [state, progress] = await Promise.all([
    findUserMediaState(db, userId, mediaId),
    findUserPlaybackProgress(db, userId, mediaId),
  ]);

  return {
    mediaId,
    trackingStatus: state?.status ?? "none",
    rating: state?.rating ?? null,
    isFavorite: state?.isFavorite ?? false,
    isHidden: state?.isHidden ?? false,
    progress: progress?.positionSeconds ?? 0,
    isCompleted: progress?.isCompleted ?? false,
    lastWatchedAt: progress?.lastWatchedAt ?? null,
    source: progress?.source ?? null,
  };
}
