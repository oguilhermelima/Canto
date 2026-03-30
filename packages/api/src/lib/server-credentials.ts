import { getSetting } from "@canto/db/settings";

export async function getJellyfinCredentials(): Promise<{
  url: string;
  apiKey: string;
} | null> {
  const url = await getSetting("jellyfin.url");
  const apiKey = await getSetting("jellyfin.apiKey");
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

export async function getPlexCredentials(): Promise<{
  url: string;
  token: string;
} | null> {
  const url = await getSetting("plex.url");
  const token = await getSetting("plex.token");
  if (!url || !token) return null;
  return { url, token };
}
