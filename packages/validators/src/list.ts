import { z } from "zod";

import { mediaFilterBase } from "./media";

export const getListBySlugInput = mediaFilterBase.extend({
  slug: z.string(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  cursor: z.number().int().min(0).nullish(),
});
export type GetListBySlugInput = z.infer<typeof getListBySlugInput>;

export const listVisibility = z.enum(["public", "private", "shared"]);
export type ListVisibility = z.infer<typeof listVisibility>;

export const listMemberRole = z.enum(["viewer", "editor", "admin"]);
export type ListMemberRole = z.infer<typeof listMemberRole>;

export const createListInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  visibility: listVisibility.optional(),
});
export type CreateListInput = z.infer<typeof createListInput>;

export const updateListInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  visibility: listVisibility.optional(),
});
export type UpdateListInput = z.infer<typeof updateListInput>;

export const addListMemberInput = z.object({
  listId: z.string().uuid(),
  userId: z.string(),
  role: listMemberRole.default("viewer"),
});
export type AddListMemberInput = z.infer<typeof addListMemberInput>;

export const updateListMemberInput = z.object({
  listId: z.string().uuid(),
  userId: z.string(),
  role: listMemberRole,
});
export type UpdateListMemberInput = z.infer<typeof updateListMemberInput>;

export const removeListMemberInput = z.object({
  listId: z.string().uuid(),
  userId: z.string(),
});
export type RemoveListMemberInput = z.infer<typeof removeListMemberInput>;

export const createListInvitationInput = z.object({
  listId: z.string().uuid(),
  email: z.string().email().optional(),
  userId: z.string().optional(),
  role: listMemberRole.default("viewer"),
});
export type CreateListInvitationInput = z.infer<typeof createListInvitationInput>;

export const acceptListInvitationInput = z.object({
  token: z.string().min(1).max(64),
});
export type AcceptListInvitationInput = z.infer<typeof acceptListInvitationInput>;

export const getListMembersInput = z.object({
  listId: z.string().uuid(),
});
export type GetListMembersInput = z.infer<typeof getListMembersInput>;

export const getListVotesInput = z.object({
  listId: z.string().uuid(),
  mediaIds: z.array(z.string().uuid()).max(100),
});
export type GetListVotesInput = z.infer<typeof getListVotesInput>;

export const updateCollectionLayoutInput = z.object({
  hiddenListIds: z.array(z.string().uuid()).max(500).default([]),
});
export type UpdateCollectionLayoutInput = z.infer<
  typeof updateCollectionLayoutInput
>;

export const reorderCollectionsInput = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
});
export type ReorderCollectionsInput = z.infer<typeof reorderCollectionsInput>;

export const reorderListItemsInput = z.object({
  listId: z.string().uuid(),
  orderedItemIds: z.array(z.string().uuid()).min(1).max(1000),
});
export type ReorderListItemsInput = z.infer<typeof reorderListItemsInput>;

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
