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

/** Certifications query input. Uses TMDB's "tv" naming because the response
 *  shape is sourced directly from `tmdb_certification.type`. */
export const certificationsInput = z.object({
  type: z.enum(["movie", "tv"]),
});
export type CertificationsInput = z.infer<typeof certificationsInput>;

/** Optional 2-letter ISO 3166-1 region. Shared by spotlight, watch-provider,
 *  and recommendation queries that scope results by viewer locale. */
export const regionInput = z
  .object({ region: z.string().length(2).optional() })
  .optional();
export type RegionInput = z.infer<typeof regionInput>;
