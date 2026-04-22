import { getSettings, setManySettings } from "@canto/db/settings";
import { TvdbProvider } from "@canto/providers";

/**
 * Read the TVDB API key + cached token from settings and return a configured
 * TvdbProvider. The onTokenRefresh callback persists new tokens back to the DB.
 */
export async function getTvdbProvider(): Promise<TvdbProvider> {
  const {
    "tvdb.apiKey": apiKey,
    "tvdb.token": token,
    "tvdb.tokenExpires": tokenExpires,
    "general.language": language,
  } = await getSettings([
    "tvdb.apiKey",
    "tvdb.token",
    "tvdb.tokenExpires",
    "general.language",
  ]);

  return new TvdbProvider({
    apiKey: apiKey ?? "",
    token,
    tokenExpires,
    language: language ?? "en-US",
    onTokenRefresh: async (newToken: string, expires: number) => {
      // Single transaction — if the second write failed in the old two-call
      // shape, we'd cache a token with a stale expiry and never re-auth.
      await setManySettings([
        { key: "tvdb.token", value: newToken },
        { key: "tvdb.tokenExpires", value: expires },
      ]);
    },
  });
}
