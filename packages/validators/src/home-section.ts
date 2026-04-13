import { z } from "zod";

export const homeSectionStyle = z.enum(["spotlight", "large_video", "card", "cover"]);
export type HomeSectionStyle = z.infer<typeof homeSectionStyle>;

export const homeSectionSourceType = z.enum(["db", "tmdb"]);
export type HomeSectionSourceType = z.infer<typeof homeSectionSourceType>;

export const dbSourceKey = z.enum([
  "spotlight",
  "recommendations",
  "continue_watching",
  "recently_added",
  "watch_next",
  "collection",
]);
export type DbSourceKey = z.infer<typeof dbSourceKey>;

export const tmdbSourceKey = z.enum(["trending", "discover"]);
export type TmdbSourceKey = z.infer<typeof tmdbSourceKey>;

export const tmdbSectionConfig = z.object({
  type: z.enum(["movie", "show"]).optional(),
  mode: z.enum(["trending", "discover"]).optional(),
  genres: z.string().optional(),
  language: z.string().optional(),
  sortBy: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  keywords: z.string().optional(),
  scoreMin: z.number().optional(),
  runtimeMin: z.number().optional(),
  runtimeMax: z.number().optional(),
  certification: z.string().optional(),
  status: z.string().optional(),
  watchProviders: z.string().optional(),
  watchRegion: z.string().optional(),
});
export type TmdbSectionConfigInput = z.infer<typeof tmdbSectionConfig>;

export const dbSectionConfig = z.object({
  mediaType: z.enum(["movie", "show"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  listId: z.string().optional(),
});
export type DbSectionConfigInput = z.infer<typeof dbSectionConfig>;

export const homeSectionInput = z.object({
  id: z.string().uuid().optional(),
  position: z.number().int().min(0).max(29),
  title: z.string().min(1).max(200),
  style: homeSectionStyle,
  sourceType: homeSectionSourceType,
  sourceKey: z.string().min(1).max(50),
  config: z.union([tmdbSectionConfig, dbSectionConfig]).default({}),
  enabled: z.boolean().default(true),
});
export type HomeSectionInput = z.infer<typeof homeSectionInput>;

export const saveHomeSectionsInput = z.object({
  sections: z.array(homeSectionInput).max(30),
});
export type SaveHomeSectionsInput = z.infer<typeof saveHomeSectionsInput>;
