import { z } from "zod";

export const loginInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof loginInput>;

export const registerInput = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type RegisterInput = z.infer<typeof registerInput>;

export const setUserPreferencesInput = z.object({
  watchRegion: z.string().max(10).optional(),
  directSearchEnabled: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});
export type SetUserPreferencesInput = z.infer<typeof setUserPreferencesInput>;
