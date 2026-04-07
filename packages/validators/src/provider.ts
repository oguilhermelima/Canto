import { z } from "zod";

export const filterOptionsInput = z.object({
  type: z.enum(["regions", "watchProviders"]),
  mediaType: z.enum(["movie", "show"]).optional(),
  region: z.string().length(2).optional(),
});
export type FilterOptionsInput = z.infer<typeof filterOptionsInput>;

export const filterSearchInput = z.object({
  type: z.enum(["networks", "companies"]),
  query: z.string().min(1),
});
export type FilterSearchInput = z.infer<typeof filterSearchInput>;

export const genresInput = z.object({
  type: z.enum(["movie", "show"]).default("movie"),
});
export type GenresInput = z.infer<typeof genresInput>;
