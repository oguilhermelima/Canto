import type { CachePort } from "@canto/core/domain/shared/ports/cache";
import type {
  RecommendationsCatalogPort,
  RegionOption,
} from "@canto/core/domain/recommendations/ports/recommendations-catalog.port";
import type { BrandedProvider } from "@canto/core/domain/recommendations/rules/canonical-brand";
import type { FilterOptionsInput } from "@canto/validators";

const FILTER_OPTIONS_TTL_SECONDS = 24 * 60 * 60;

export type { RegionOption };
export type WatchProviderOption = BrandedProvider;

export interface GetFilterOptionsDeps {
  cache: CachePort;
  catalog: RecommendationsCatalogPort;
}

async function listRegions(deps: GetFilterOptionsDeps): Promise<RegionOption[]> {
  return deps.cache.wrap(
    "provider:regions",
    FILTER_OPTIONS_TTL_SECONDS,
    () => deps.catalog.listRegions(),
  );
}

async function listWatchProviders(
  deps: GetFilterOptionsDeps,
  mediaType: "movie" | "show",
  region: string,
): Promise<WatchProviderOption[]> {
  return deps.cache.wrap(
    `provider:wp:v2:${mediaType}:${region}`,
    FILTER_OPTIONS_TTL_SECONDS,
    () => deps.catalog.listWatchProviders(mediaType, region),
  );
}

export async function getFilterOptions(
  deps: GetFilterOptionsDeps,
  input: FilterOptionsInput,
): Promise<RegionOption[] | WatchProviderOption[]> {
  if (input.type === "regions") return listRegions(deps);
  const mediaType = input.mediaType ?? "movie";
  const region = input.region ?? "US";
  return listWatchProviders(deps, mediaType, region);
}
