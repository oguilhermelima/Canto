import { resetQBClient } from "../torrent-clients/qbittorrent.adapter";
import { resetProwlarrClient } from "../indexers/prowlarr.adapter";
import { resetJackettClient } from "../indexers/jackett.adapter";

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
