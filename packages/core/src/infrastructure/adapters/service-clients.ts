import { resetQBClient } from "./torrent-clients/qbittorrent";
import { resetProwlarrClient } from "./indexers/prowlarr";
import { resetJackettClient } from "./indexers/jackett";

/**
 * Drop every cached service-client singleton whose credentials live under the
 * given setting key prefixes. Call this whenever admin settings are mutated so
 * subsequent `getXxxClient()` calls re-read the updated URL / API key / password
 * instead of re-using an instance constructed with stale credentials.
 *
 * Providers that create a fresh instance per call (TMDB, TVDB) don't need this
 * — they pick up new settings the moment the cache is invalidated by the write.
 */
export function invalidateServiceClients(keys: readonly string[]): void {
  const prefixes = new Set<string>();
  for (const key of keys) {
    const prefix = key.split(".")[0];
    if (prefix) prefixes.add(prefix);
  }
  if (prefixes.has("qbittorrent")) resetQBClient();
  if (prefixes.has("prowlarr")) resetProwlarrClient();
  if (prefixes.has("jackett")) resetJackettClient();
}
