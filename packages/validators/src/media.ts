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

