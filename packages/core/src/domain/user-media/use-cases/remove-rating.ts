import type { Database } from "@canto/db/client";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import { findMediaByIdWithSeasons } from "@canto/core/infra/repositories";

export interface RemoveRatingDeps {
  repo: UserMediaRepositoryPort;
}

export interface RemoveRatingInput {
  mediaId: string;
  seasonId?: string;
  episodeId?: string;
}

export async function removeRating(
  db: Database,
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
    const media = await findMediaByIdWithSeasons(db, input.mediaId);
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
