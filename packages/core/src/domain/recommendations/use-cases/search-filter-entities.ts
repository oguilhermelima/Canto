import { cached } from "@canto/core/platform/cache/redis";
import { fetchFromTmdb } from "@canto/core/platform/http/tmdb-raw";
import type { FilterSearchInput } from "@canto/validators";

export type FilterEntity = {
  id: number;
  name: string;
  logoPath: string | null;
  originCountry: string;
};

interface TmdbSearchResponse {
  results: Array<{
    id: number;
    name: string;
    logo_path: string | null;
    origin_country: string;
  }>;
}

/**
 * Search for networks or companies via TMDB. Backs the "pick a network"
 * / "pick a studio" inputs in the filter sidebar.
 */
export async function searchFilterEntities(
  input: FilterSearchInput,
): Promise<FilterEntity[]> {
  const endpoint =
    input.type === "networks" ? "/search/network" : "/search/company";
  return cached(`provider:${input.type}:${input.query}`, 300, async () => {
    const data = await fetchFromTmdb<TmdbSearchResponse>(endpoint, {
      query: input.query,
    });
    return data.results.map((n) => ({
      id: n.id,
      name: n.name,
      logoPath: n.logo_path,
      originCountry: n.origin_country,
    }));
  });
}
