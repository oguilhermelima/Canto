import { z } from "zod";

import { mediaType, providerType } from "./media";

export const listInput = z.object({
  type: mediaType.optional(),
  genre: z.string().optional(),
  status: z.string().optional(),
  yearMin: z.number().int().optional(),
  yearMax: z.number().int().optional(),
  language: z.string().optional(),
  scoreMin: z.number().min(0).max(10).optional(),
  scoreMax: z.number().min(0).max(10).optional(),
  runtimeMax: z.number().int().positive().optional(),
  contentRating: z.string().optional(),
  network: z.string().optional(),
  provider: providerType.optional(),
  search: z.string().optional(),
  downloaded: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  cursor: z.number().int().positive().nullish(),
  pageSize: z.number().int().positive().max(100).default(20),
  sortBy: z
    .enum([
      "title",
      "year",
      "addedAt",
      "voteAverage",
      "popularity",
      "releaseDate",
    ])
    .default("addedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ListInput = z.infer<typeof listInput>;

export const setMediaLibraryInput = z.object({
  mediaId: z.string().uuid(),
  libraryId: z.string().uuid().nullable(),
});
export type SetMediaLibraryInput = z.infer<typeof setMediaLibraryInput>;

export const setContinuousDownloadInput = z.object({
  mediaId: z.string().uuid(),
  enabled: z.boolean(),
});
export type SetContinuousDownloadInput = z.infer<typeof setContinuousDownloadInput>;

export const setPreferenceInput = z.object({
  key: z.string(),
  value: z.unknown(),
});
export type SetPreferenceInput = z.infer<typeof setPreferenceInput>;

export const setDownloadSettingsInput = z.object({
  importMethod: z.enum(["local", "remote"]),
  seedRatioLimit: z.number().min(0).nullable(),
  seedTimeLimitHours: z.number().min(0).nullable(),
  seedCleanupFiles: z.boolean(),
});
export type SetDownloadSettingsInput = z.infer<typeof setDownloadSettingsInput>;
