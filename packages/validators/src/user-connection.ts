import { z } from "zod";

export const userConnectionProvider = z.enum(["plex", "jellyfin", "trakt"]);
export type UserConnectionProvider = z.infer<typeof userConnectionProvider>;

export const addUserConnectionInput = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("plex"),
    token: z.string().min(1),
  }),
  z.object({
    provider: z.literal("jellyfin"),
    username: z.string().min(1),
    password: z.string().min(1),
  }),
]);
export type AddUserConnectionInput = z.infer<typeof addUserConnectionInput>;

export const updateUserConnectionInput = z.object({
  id: z.string().uuid(),
  token: z.string().min(1).optional(),
  accessibleLibraries: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateUserConnectionInput = z.infer<typeof updateUserConnectionInput>;

export const deleteUserConnectionInput = z.object({
  id: z.string().uuid(),
});
export type DeleteUserConnectionInput = z.infer<typeof deleteUserConnectionInput>;
