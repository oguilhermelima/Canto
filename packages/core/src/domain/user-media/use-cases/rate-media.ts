import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";

export interface RateMediaDeps {
  repo: UserMediaRepositoryPort;
}

export interface RateMediaInput {
  mediaId: string;
  seasonId?: string;
  episodeId?: string;
  rating: number;
  comment?: string;
}

export async function rateMedia(
  deps: RateMediaDeps,
  userId: string,
  input: RateMediaInput,
): Promise<{ success: true }> {
  await deps.repo.upsertRating({
    userId,
    mediaId: input.mediaId,
    seasonId: input.seasonId ?? null,
    episodeId: input.episodeId ?? null,
    rating: input.rating,
    comment: input.comment ?? null,
    isOverride: true,
  });

  if (!input.episodeId && !input.seasonId) {
    await deps.repo.upsertState({
      userId,
      mediaId: input.mediaId,
      rating: input.rating,
    });
  }

  return { success: true };
}
