import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";

export interface RemoveRatingDeps {
  repo: UserMediaRepositoryPort;
  mediaRepo: MediaRepositoryPort;
}

export interface RemoveRatingInput {
  mediaId: string;
  seasonId?: string;
  episodeId?: string;
}

export async function removeRating(
  deps: RemoveRatingDeps,
  userId: string,
  input: RemoveRatingInput,
): Promise<{ success: true }> {
  await deps.repo.deleteRating(
    userId,
    input.mediaId,
    input.seasonId ?? null,
    input.episodeId ?? null,
  );

  if (input.episodeId) {
    const media = await deps.mediaRepo.findByIdWithSeasons(input.mediaId);
    const season = media?.seasons.find((s) =>
      s.episodes.some((e) => e.id === input.episodeId),
    );
    if (season) {
      await deps.repo.computeAndSyncSeasonRating(userId, input.mediaId, season.id);
    }
  } else if (input.seasonId) {
    await deps.repo.computeAndSyncMediaRating(userId, input.mediaId);
  }

  return { success: true };
}
