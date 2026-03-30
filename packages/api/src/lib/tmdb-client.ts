import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "./settings-keys";
import { TmdbProvider } from "@canto/providers";

/**
 * Read the TMDB API key from settings and return a configured TmdbProvider.
 */
export async function getTmdbProvider(): Promise<TmdbProvider> {
  const apiKey = (await getSetting(SETTINGS.TMDB_API_KEY)) ?? "";
  return new TmdbProvider(apiKey);
}
