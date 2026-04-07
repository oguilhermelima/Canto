import { z } from "zod";

export const serviceEnum = z.enum([
  "jellyfin", "plex", "qbittorrent", "prowlarr", "jackett", "tvdb", "tmdb",
]);
export type ServiceEnum = z.infer<typeof serviceEnum>;

export const getSettingInput = z.object({
  key: z.string(),
});
export type GetSettingInput = z.infer<typeof getSettingInput>;

export const setSettingInput = z.object({
  key: z.string(),
  value: z.unknown(),
});
export type SetSettingInput = z.infer<typeof setSettingInput>;

export const deleteSettingInput = z.object({
  key: z.string(),
});
export type DeleteSettingInput = z.infer<typeof deleteSettingInput>;

export const setManySettingsInput = z.object({
  settings: z.array(z.object({ key: z.string(), value: z.unknown() })),
});
export type SetManySettingsInput = z.infer<typeof setManySettingsInput>;

export const testServiceInput = z.object({
  service: serviceEnum,
  values: z.record(z.string(), z.string()),
});
export type TestServiceInput = z.infer<typeof testServiceInput>;

export const setUserLanguageInput = z.object({
  language: z.string().min(2).max(10),
});
export type SetUserLanguageInput = z.infer<typeof setUserLanguageInput>;

export const toggleServiceInput = z.object({
  service: serviceEnum,
  enabled: z.boolean(),
});
export type ToggleServiceInput = z.infer<typeof toggleServiceInput>;

export const toggleTvdbDefaultInput = z.object({
  enabled: z.boolean(),
});
export type ToggleTvdbDefaultInput = z.infer<typeof toggleTvdbDefaultInput>;

export const authenticateJellyfinInput = z.object({
  url: z.string().url(),
  username: z.string().min(1),
  password: z.string(),
});
export type AuthenticateJellyfinInput = z.infer<typeof authenticateJellyfinInput>;

export const authenticatePlexInput = z.object({
  url: z.string().url(),
  token: z.string().min(1),
});
export type AuthenticatePlexInput = z.infer<typeof authenticatePlexInput>;

export const loginPlexInput = z.object({
  url: z.string().url(),
  email: z.string().min(1),
  password: z.string().min(1),
});
export type LoginPlexInput = z.infer<typeof loginPlexInput>;

export const checkPlexPinInput = z.object({
  pinId: z.number(),
  clientId: z.string(),
  serverUrl: z.string().url().optional(),
});
export type CheckPlexPinInput = z.infer<typeof checkPlexPinInput>;

export const mergeJellyfinVersionsInput = z.object({
  jellyfinItemIds: z.array(z.string()).min(2),
});
export type MergeJellyfinVersionsInput = z.infer<typeof mergeJellyfinVersionsInput>;
