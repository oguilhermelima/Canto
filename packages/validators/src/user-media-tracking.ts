import { z } from "zod";

export const userMediaStatus = z.enum([
  "none",
  "planned",
  "watching",
  "completed",
  "dropped",
]);
export type UserMediaStatus = z.infer<typeof userMediaStatus>;

export const updateMediaStatusInput = z.object({
  mediaId: z.string().uuid(),
  status: userMediaStatus.optional(),
  rating: z.number().int().min(1).max(10).optional(),
});
export type UpdateMediaStatusInput = z.infer<typeof updateMediaStatusInput>;

export const rateInput = z.object({
  mediaId: z.string().uuid(),
  seasonId: z.string().uuid().optional(),
  episodeId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(10),
  comment: z.string().max(5000).optional(),
});
export type RateInput = z.infer<typeof rateInput>;

export const removeRatingInput = z.object({
  mediaId: z.string().uuid(),
  seasonId: z.string().uuid().optional(),
  episodeId: z.string().uuid().optional(),
});
export type RemoveRatingInput = z.infer<typeof removeRatingInput>;

export const reportPlaybackProgressInput = z.object({
  mediaId: z.string().uuid(),
  episodeId: z.string().uuid().optional(),
  positionSeconds: z.number().int().min(0),
  isCompleted: z.boolean().default(false),
});
export type ReportPlaybackProgressInput = z.infer<typeof reportPlaybackProgressInput>;
