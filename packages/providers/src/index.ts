import { TmdbProvider } from "./tmdb";
import { TvdbProvider } from "./tvdb";
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
      case "tvdb":
        throw new Error(
          'TVDB provider requires explicit construction via getTvdbProvider() — use the factory in api/src/lib/tvdb-client.ts',
        );
      default:
        throw new Error(`Provider "${name}" not implemented`);
    }
    providers.set(name, provider);
  }
  return provider;
}

export * from "./types";
export { TmdbProvider } from "./tmdb";
export { TvdbProvider } from "./tvdb";
