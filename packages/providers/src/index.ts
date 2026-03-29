import { AniListProvider } from "./anilist";
import { TmdbProvider } from "./tmdb";
import type { MetadataProvider, ProviderName } from "./types";

const providers = new Map<ProviderName, MetadataProvider>();

export async function getProvider(
  name: ProviderName,
  apiKey?: string,
): Promise<MetadataProvider> {
  // Always recreate TMDB provider if a key is provided (key may change)
  if (name === "tmdb" && apiKey) {
    const provider = new TmdbProvider(apiKey);
    providers.set(name, provider);
    return provider;
  }

  let provider = providers.get(name);
  if (!provider) {
    switch (name) {
      case "tmdb":
        provider = new TmdbProvider(apiKey ?? "");
        break;
      case "anilist":
        provider = new AniListProvider();
        break;
      default:
        throw new Error(`Provider "${name}" not implemented`);
    }
    providers.set(name, provider);
  }
  return provider;
}

export * from "./types";
export { AniListProvider } from "./anilist";
export { TmdbProvider } from "./tmdb";
