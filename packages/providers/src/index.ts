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
      default:
        throw new Error(`Provider "${name}" not implemented`);
    }
    providers.set(name, provider);
  }
  return provider;
}

export * from "./types";
export { TmdbProvider } from "./tmdb";
