import type { Database } from "@canto/db/client";
import {
  computeAndSyncMediaRating,
  computeAndSyncSeasonRating,
  deleteUserRating,
  findMediaByIdWithSeasons,
} from "../../../infrastructure/repositories";

export interface RemoveRatingInput {
  mediaId: string;
  seasonId?: string;
  episodeId?: string;
}

export async function removeRating(
  db: Database,
  userId: string,
  input: RemoveRatingInput,
): Promise<{ success: true }> {
  await deleteUserRating(
    db,
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
      await computeAndSyncSeasonRating(db, userId, input.mediaId, season.id);
    }
  } else if (input.seasonId) {
    await computeAndSyncMediaRating(db, userId, input.mediaId);
  }

  return { success: true };
}
