import type { SettingKey } from "@canto/db/settings";
import type { ServiceEnum } from "@canto/validators";

/**
 * Maps each external service to its `*.enabled` setting key. Keeps the
 * settings router from branching on service names and keeps the source of
 * truth in one place.
 */
export const SERVICE_ENABLED_KEY: Record<ServiceEnum, SettingKey> = {
  jellyfin: "jellyfin.enabled",
  plex: "plex.enabled",
  qbittorrent: "qbittorrent.enabled",
  prowlarr: "prowlarr.enabled",
  jackett: "jackett.enabled",
  tvdb: "tvdb.enabled",
  tmdb: "tmdb.enabled",
};
