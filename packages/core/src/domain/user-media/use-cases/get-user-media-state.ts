import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";

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

export interface GetUserMediaStateDeps {
  repo: UserMediaRepositoryPort;
}

export async function getUserMediaState(
  deps: GetUserMediaStateDeps,
  userId: string,
  mediaId: string,
): Promise<UserMediaStateResponse> {
  const [state, progress] = await Promise.all([
    deps.repo.findState(userId, mediaId),
    deps.repo.findPlayback(userId, mediaId),
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
