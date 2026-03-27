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
  runtimeMax: z.number().int().positive().optional(),
  contentRating: z.string().optional(),
  network: z.string().optional(),
  provider: providerType.optional(),
  search: z.string().optional(),
  downloaded: z.boolean().optional(),
  page: z.number().int().positive().default(1),
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
