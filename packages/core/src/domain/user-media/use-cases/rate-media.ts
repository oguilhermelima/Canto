import type { Database } from "@canto/db/client";
import {
  upsertUserMediaState,
  upsertUserRating,
} from "../../../infra/repositories";

export interface RateMediaInput {
  mediaId: string;
  seasonId?: string;
  episodeId?: string;
  rating: number;
  comment?: string;
}

export async function rateMedia(
  db: Database,
  userId: string,
  input: RateMediaInput,
): Promise<{ success: true }> {
  await upsertUserRating(db, {
    userId,
    mediaId: input.mediaId,
    seasonId: input.seasonId ?? null,
    episodeId: input.episodeId ?? null,
    rating: input.rating,
    comment: input.comment ?? null,
    isOverride: true,
  });

  if (!input.episodeId && !input.seasonId) {
    await upsertUserMediaState(db, {
      userId,
      mediaId: input.mediaId,
      rating: input.rating,
    });
  }

  return { success: true };
}
