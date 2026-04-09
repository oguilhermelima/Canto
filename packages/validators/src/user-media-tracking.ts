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

export const reportPlaybackProgressInput = z.object({
  mediaId: z.string().uuid(),
  episodeId: z.string().uuid().optional(),
  positionSeconds: z.number().int().min(0),
  isCompleted: z.boolean().default(false),
});
export type ReportPlaybackProgressInput = z.infer<typeof reportPlaybackProgressInput>;
