import type { BrandedProvider } from "@canto/core/domain/recommendations/rules/canonical-brand";

/** Region option surfaced by the filter sidebar (TMDB watch-region list). */
export interface RegionOption {
  code: string;
  englishName: string;
  nativeName: string;
}

/** Filter "search a network/company" entity returned by the TMDB search. */
export interface FilterEntity {
  id: number;
  name: string;
  logoPath: string | null;
  originCountry: string;
}

/**
 * Catalog endpoints used by the recommendations + filter UI. All return
 * provider-agnostic shapes so the rest of `domain/recommendations/**` can
 * stay framework-free; the adapter lives in `platform/http` and talks to
 * TMDB raw endpoints not covered by {@link MediaProviderPort}.
 */
export interface RecommendationsCatalogPort {
  /** TMDB watch-region list, used by the filter sidebar. */
  listRegions(): Promise<RegionOption[]>;

  /**
   * Watch providers (Netflix, Disney+, ...) available in the given region,
   * deduplicated by canonical brand.
   */
  listWatchProviders(
    mediaType: "movie" | "show",
    region: string,
  ): Promise<BrandedProvider[]>;

  /**
   * Cross-media-type union of watch providers available in the region,
   * deduplicated by canonical brand. Backs the user's "watch providers"
   * preference picker.
   */
  listAllWatchProviders(region: string): Promise<BrandedProvider[]>;

  /**
   * Search TMDB for networks (filter type "networks") or companies
   * ("companies") matching the query string.
   */
  searchEntities(
    type: "networks" | "companies",
    query: string,
  ): Promise<FilterEntity[]>;
}
