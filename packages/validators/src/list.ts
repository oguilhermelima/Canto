import { z } from "zod";

export const getListBySlugInput = z.object({
  slug: z.string(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  cursor: z.number().int().min(0).nullish(),
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
export type GetListBySlugInput = z.infer<typeof getListBySlugInput>;

export const createListInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});
export type CreateListInput = z.infer<typeof createListInput>;

export const updateListInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
});
export type UpdateListInput = z.infer<typeof updateListInput>;

export const addListItemInput = z.object({
  listId: z.string().uuid(),
  mediaId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
});
export type AddListItemInput = z.infer<typeof addListItemInput>;

export const removeListItemInput = z.object({
  listId: z.string().uuid(),
  mediaId: z.string().uuid(),
});
export type RemoveListItemInput = z.infer<typeof removeListItemInput>;
