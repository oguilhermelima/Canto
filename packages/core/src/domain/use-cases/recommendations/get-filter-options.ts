import { cached } from "../../../infrastructure/cache/redis";
import { fetchFromTmdb } from "../../../infrastructure/adapters/tmdb-raw";
import type { FilterOptionsInput } from "@canto/validators";

export type RegionOption = {
  code: string;
  englishName: string;
  nativeName: string;
};

export type WatchProviderOption = {
  providerId: number;
  providerName: string;
  logoPath: string;
  displayPriority: number;
};

interface TmdbRegionsResponse {
  results: Array<{ iso_3166_1: string; english_name: string; native_name: string }>;
}

interface TmdbProvidersResponse {
  results: Array<{
    provider_id: number;
    provider_name: string;
    logo_path: string;
    display_priority: number;
    display_priorities: Record<string, number>;
  }>;
}

async function listRegions(): Promise<RegionOption[]> {
  return cached("provider:regions", 86400, async () => {
    const data = await fetchFromTmdb<TmdbRegionsResponse>("/watch/providers/regions");
    return data.results.map((r) => ({
      code: r.iso_3166_1,
      englishName: r.english_name,
      nativeName: r.native_name,
    }));
  });
}

async function listWatchProviders(
  mediaType: "movie" | "show",
  region: string,
): Promise<WatchProviderOption[]> {
  return cached(`provider:wp:${mediaType}:${region}`, 86400, async () => {
    const endpoint =
      mediaType === "movie" ? "/watch/providers/movie" : "/watch/providers/tv";
    const data = await fetchFromTmdb<TmdbProvidersResponse>(endpoint, {
      watch_region: region,
    });
    return data.results.map((p) => ({
      providerId: p.provider_id,
      providerName: p.provider_name,
      logoPath: p.logo_path,
      displayPriority: p.display_priority,
    }));
  });
}

/**
 * Serve the filter sidebar: either the region picker data or the list of
 * watch providers for a given (mediaType, region) pair. TMDB exposes these
 * on separate endpoints; we union the result so the client has one entry
 * point.
 */
export async function getFilterOptions(
  input: FilterOptionsInput,
): Promise<RegionOption[] | WatchProviderOption[]> {
  if (input.type === "regions") return listRegions();
  const mediaType = input.mediaType ?? "movie";
  const region = input.region ?? "US";
  return listWatchProviders(mediaType, region);
}
