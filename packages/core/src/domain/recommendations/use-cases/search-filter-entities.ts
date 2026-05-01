import type { CachePort } from "@canto/core/domain/shared/ports/cache";
import type {
  FilterEntity,
  RecommendationsCatalogPort,
} from "@canto/core/domain/recommendations/ports/recommendations-catalog.port";
import type { FilterSearchInput } from "@canto/validators";

const FILTER_SEARCH_TTL_SECONDS = 5 * 60;

export type { FilterEntity };

export interface SearchFilterEntitiesDeps {
  cache: CachePort;
  catalog: RecommendationsCatalogPort;
}

/**
 * Search for networks or companies via TMDB. Backs the "pick a network" /
 * "pick a studio" inputs in the filter sidebar. Cached 5 minutes per
 * (type, query).
 */
export async function searchFilterEntities(
  deps: SearchFilterEntitiesDeps,
  input: FilterSearchInput,
): Promise<FilterEntity[]> {
  return deps.cache.wrap(
    `provider:${input.type}:${input.query}`,
    FILTER_SEARCH_TTL_SECONDS,
    () => deps.catalog.searchEntities(input.type, input.query),
  );
}
