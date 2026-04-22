import { getSettings } from "@canto/db/settings";

export async function getJellyfinCredentials(): Promise<{
  url: string;
  apiKey: string;
} | null> {
  const { "jellyfin.url": url, "jellyfin.apiKey": apiKey } = await getSettings([
    "jellyfin.url",
    "jellyfin.apiKey",
  ]);
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

export async function getPlexCredentials(): Promise<{
  url: string;
  token: string;
} | null> {
  const { "plex.url": url, "plex.token": token } = await getSettings([
    "plex.url",
    "plex.token",
  ]);
  if (!url || !token) return null;
  return { url, token };
}
