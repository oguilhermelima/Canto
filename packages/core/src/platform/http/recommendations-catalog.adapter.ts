import type {
  FilterEntity,
  RecommendationsCatalogPort,
  RegionOption,
} from "@canto/core/domain/recommendations/ports/recommendations-catalog.port";
import type {
  BrandedProvider,
  WatchProvider,
} from "@canto/core/domain/recommendations/rules/canonical-brand";
import { groupByBrand } from "@canto/core/domain/recommendations/rules/canonical-brand";
import { fetchFromTmdb } from "@canto/core/platform/http/tmdb-raw";

interface TmdbRegionsResponse {
  results: Array<{
    iso_3166_1: string;
    english_name: string;
    native_name: string;
  }>;
}

interface TmdbProvidersResponse {
  results: Array<{
    provider_id: number;
    provider_name: string;
    logo_path: string;
    display_priority: number;
    display_priorities?: Record<string, number>;
  }>;
}

interface TmdbSearchEntityResponse {
  results: Array<{
    id: number;
    name: string;
    logo_path: string | null;
    origin_country: string;
  }>;
}

const PROVIDER_ENDPOINT: Record<"movie" | "show", string> = {
  movie: "/watch/providers/movie",
  show: "/watch/providers/tv",
};

const SEARCH_ENDPOINT: Record<"networks" | "companies", string> = {
  networks: "/search/network",
  companies: "/search/company",
};

/**
 * Adapter for {@link RecommendationsCatalogPort}. Talks directly to the TMDB
 * raw endpoints that aren't part of the abstract media-provider contract
 * (regions, watch providers, network/company search).
 */
export function makeRecommendationsCatalog(): RecommendationsCatalogPort {
  return {
    async listRegions(): Promise<RegionOption[]> {
      const data = await fetchFromTmdb<TmdbRegionsResponse>(
        "/watch/providers/regions",
      );
      return data.results.map((r) => ({
        code: r.iso_3166_1,
        englishName: r.english_name,
        nativeName: r.native_name,
      }));
    },

    async listWatchProviders(mediaType, region): Promise<BrandedProvider[]> {
      const data = await fetchFromTmdb<TmdbProvidersResponse>(
        PROVIDER_ENDPOINT[mediaType],
        { watch_region: region },
      );
      return groupByBrand(
        data.results.map((p) => ({
          providerId: p.provider_id,
          providerName: p.provider_name,
          logoPath: p.logo_path,
          displayPriority: p.display_priority,
        })),
      );
    },

    async listAllWatchProviders(region): Promise<BrandedProvider[]> {
      const [movieRes, tvRes] = await Promise.all([
        fetchFromTmdb<TmdbProvidersResponse>(PROVIDER_ENDPOINT.movie, {
          watch_region: region,
        }),
        fetchFromTmdb<TmdbProvidersResponse>(PROVIDER_ENDPOINT.show, {
          watch_region: region,
        }),
      ]);

      const byId = new Map<number, WatchProvider>();
      for (const p of [...movieRes.results, ...tvRes.results]) {
        const prev = byId.get(p.provider_id);
        if (!prev || p.display_priority < prev.displayPriority) {
          byId.set(p.provider_id, {
            providerId: p.provider_id,
            providerName: p.provider_name,
            logoPath: p.logo_path,
            displayPriority: p.display_priority,
          });
        }
      }
      return groupByBrand(Array.from(byId.values()));
    },

    async searchEntities(type, query): Promise<FilterEntity[]> {
      const data = await fetchFromTmdb<TmdbSearchEntityResponse>(
        SEARCH_ENDPOINT[type],
        { query },
      );
      return data.results.map((n) => ({
        id: n.id,
        name: n.name,
        logoPath: n.logo_path,
        originCountry: n.origin_country,
      }));
    },
  };
}
