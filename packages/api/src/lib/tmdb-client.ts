import { getSetting } from "@canto/db/settings";
import { TmdbProvider } from "@canto/providers";

/**
 * Read the TMDB API key from settings and return a configured TmdbProvider.
 */
export async function getTmdbProvider(): Promise<TmdbProvider> {
  const apiKey = (await getSetting("tmdb.apiKey")) ?? "";
  return new TmdbProvider(apiKey);
}
