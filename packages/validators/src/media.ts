import { z } from "zod";

export const mediaType = z.enum(["movie", "show"]);
export type MediaType = z.infer<typeof mediaType>;

export const providerType = z.enum(["tmdb", "tvdb"]);
export type ProviderType = z.infer<typeof providerType>;

export const searchInput = z.object({
  query: z.string().min(1).max(200),
  type: mediaType,
  provider: providerType.default("tmdb"),
  page: z.number().int().positive().default(1),
  cursor: z.number().int().positive().nullish(),
});
export type SearchInput = z.infer<typeof searchInput>;

export const getByExternalInput = z.object({
  provider: providerType,
  externalId: z.number().int().positive(),
  type: mediaType,
});
export type GetByExternalInput = z.infer<typeof getByExternalInput>;

export const getByIdInput = z.object({
  id: z.string().uuid(),
});
export type GetByIdInput = z.infer<typeof getByIdInput>;

export const getByMediaIdInput = z.object({
  mediaId: z.string().uuid(),
});
export type GetByMediaIdInput = z.infer<typeof getByMediaIdInput>;

export const browseMediaInput = z.object({
  mode: z.enum(["search", "trending", "discover"]).default("trending"),
  type: z.enum(["movie", "show"]),
  query: z.string().optional(),
  provider: z.enum(["tmdb", "tvdb"]).default("tmdb"),
  genres: z.string().optional(),
  language: z.string().optional(),
  sortBy: z.string().optional(),
  dateFrom: z.string().optional(),
  keywords: z.string().optional(),
  scoreMin: z.number().optional(),
  runtimeMax: z.number().optional(),
  dateTo: z.string().optional(),
  certification: z.string().optional(),
  status: z.string().optional(),
  watchProviders: z.string().optional(),
  watchRegion: z.string().optional(),
  runtimeMin: z.number().optional(),
  page: z.number().int().min(1).default(1),
  cursor: z.number().int().positive().nullish(),
});
export type BrowseMediaInput = z.infer<typeof browseMediaInput>;

export const resolveMediaInput = z.object({
  externalId: z.number(),
  provider: z.enum(["tmdb", "tvdb"]),
  type: z.enum(["movie", "show"]),
});
export type ResolveMediaInput = z.infer<typeof resolveMediaInput>;

export const getPersonInput = z.object({
  personId: z.number(),
});
export type GetPersonInput = z.infer<typeof getPersonInput>;

export const recommendationsInput = z.object({
  cursor: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(20).default(10),
  genreIds: z.array(z.number()).optional(),
  genreMode: z.enum(["and", "or"]).default("or").optional(),
  language: z.string().optional(),
  scoreMin: z.number().optional(),
  yearMin: z.string().optional(),
  yearMax: z.string().optional(),
  runtimeMin: z.number().optional(),
  runtimeMax: z.number().optional(),
  certification: z.string().optional(),
  status: z.string().optional(),
  sortBy: z.string().optional(),
  watchProviders: z.string().optional(),
  watchRegion: z.string().optional(),
});
export type RecommendationsInput = z.infer<typeof recommendationsInput>;

