import { z } from "zod";

export const createRequestInput = z.object({
  mediaId: z.string().uuid(),
  note: z.string().max(1000).optional(),
});
export type CreateRequestInput = z.infer<typeof createRequestInput>;

export const listRequestsInput = z.object({
  status: z
    .enum(["pending", "approved", "rejected", "downloaded", "cancelled"])
    .optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.number().int().min(0).default(0),
});
export type ListRequestsInput = z.infer<typeof listRequestsInput>;

export const resolveRequestInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  adminNote: z.string().max(1000).optional(),
});
export type ResolveRequestInput = z.infer<typeof resolveRequestInput>;
