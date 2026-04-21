import { cached } from "../../../infrastructure/cache/redis";
import { fetchFromTmdb } from "../../../infrastructure/adapters/tmdb-raw";
import { groupByBrand, type BrandedProvider } from "../../rules/canonical-brand";
import type { FilterOptionsInput } from "@canto/validators";

export type RegionOption = {
  code: string;
  englishName: string;
  nativeName: string;
};

export type WatchProviderOption = BrandedProvider;

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
  return cached(`provider:wp:v2:${mediaType}:${region}`, 86400, async () => {
    const endpoint =
      mediaType === "movie" ? "/watch/providers/movie" : "/watch/providers/tv";
    const data = await fetchFromTmdb<TmdbProvidersResponse>(endpoint, {
      watch_region: region,
    });
    return groupByBrand(
      data.results.map((p) => ({
        providerId: p.provider_id,
        providerName: p.provider_name,
        logoPath: p.logo_path,
        displayPriority: p.display_priority,
      })),
    );
  });
}

export async function getFilterOptions(
  input: FilterOptionsInput,
): Promise<RegionOption[] | WatchProviderOption[]> {
  if (input.type === "regions") return listRegions();
  const mediaType = input.mediaType ?? "movie";
  const region = input.region ?? "US";
  return listWatchProviders(mediaType, region);
}
