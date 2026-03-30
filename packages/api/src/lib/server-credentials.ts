import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "./settings-keys";

export async function getJellyfinCredentials(): Promise<{
  url: string;
  apiKey: string;
} | null> {
  const url = await getSetting(SETTINGS.JELLYFIN_URL);
  const apiKey = await getSetting(SETTINGS.JELLYFIN_API_KEY);
  if (!url || !apiKey) return null;
  return { url, apiKey };
}

export async function getPlexCredentials(): Promise<{
  url: string;
  token: string;
} | null> {
  const url = await getSetting(SETTINGS.PLEX_URL);
  const token = await getSetting(SETTINGS.PLEX_TOKEN);
  if (!url || !token) return null;
  return { url, token };
}
