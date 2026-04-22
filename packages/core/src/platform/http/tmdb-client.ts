import { getSettings } from "@canto/db/settings";
import { TmdbProvider } from "@canto/providers";

/**
 * Read the TMDB API key from settings and return a configured TmdbProvider.
 */
export async function getTmdbProvider(): Promise<TmdbProvider> {
  const { "tmdb.apiKey": apiKey, "general.language": language } =
    await getSettings(["tmdb.apiKey", "general.language"]);
  return new TmdbProvider(apiKey ?? "", language ?? "en-US");
}
