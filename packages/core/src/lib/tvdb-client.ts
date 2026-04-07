import { getSetting, setSetting } from "@canto/db/settings";
import { TvdbProvider } from "@canto/providers";
import { SETTINGS } from "./settings-keys";

/**
 * Read the TVDB API key + cached token from settings and return a configured
 * TvdbProvider. The onTokenRefresh callback persists new tokens back to the DB.
 */
export async function getTvdbProvider(): Promise<TvdbProvider> {
  const apiKey = (await getSetting(SETTINGS.TVDB_API_KEY)) ?? "";
  const token = await getSetting<string>(SETTINGS.TVDB_TOKEN);
  const tokenExpires = await getSetting<number>(SETTINGS.TVDB_TOKEN_EXPIRES);

  const language = (await getSetting(SETTINGS.LANGUAGE)) ?? "en-US";

  return new TvdbProvider({
    apiKey,
    token,
    tokenExpires,
    language,
    onTokenRefresh: async (newToken: string, expires: number) => {
      await setSetting(SETTINGS.TVDB_TOKEN, newToken);
      await setSetting(SETTINGS.TVDB_TOKEN_EXPIRES, expires);
    },
  });
}
