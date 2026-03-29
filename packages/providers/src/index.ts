import { AniListProvider } from "./anilist";
import { TmdbProvider } from "./tmdb";
import type { MetadataProvider, ProviderName } from "./types";

const providers = new Map<ProviderName, MetadataProvider>();

export function getProvider(name: ProviderName): MetadataProvider {
  let provider = providers.get(name);
  if (!provider) {
    switch (name) {
      case "tmdb":
        provider = new TmdbProvider();
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
