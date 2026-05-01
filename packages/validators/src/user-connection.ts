import { z } from "zod";

export const userConnectionProvider = z.enum(["plex", "jellyfin", "trakt"]);
export type UserConnectionProvider = z.infer<typeof userConnectionProvider>;

/** Subset of {@link userConnectionProvider} for the media-server-only flows
 *  (Plex / Jellyfin). Used by `reuseAdminCreds` and similar endpoints that
 *  don't apply to the Trakt remote. */
export const mediaServerProvider = z.enum(["jellyfin", "plex"]);
export type MediaServerProvider = z.infer<typeof mediaServerProvider>;

export const reuseAdminCredsInput = z.object({
  provider: mediaServerProvider,
});
export type ReuseAdminCredsInput = z.infer<typeof reuseAdminCredsInput>;

export const addUserConnectionInput = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("plex"),
    credentials: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("token"), token: z.string().min(1) }),
      z.object({
        mode: z.literal("email"),
        email: z.string().email(),
        password: z.string().min(1),
      }),
    ]),
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

export const traktDeviceCheckInput = z.object({
  deviceCode: z.string().min(1),
});
export type TraktDeviceCheckInput = z.infer<typeof traktDeviceCheckInput>;
