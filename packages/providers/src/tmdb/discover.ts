import type {
  DiscoverOpts,
  MediaType,
  SearchOpts,
  SearchResult,
} from "../types";
import type { TmdbClient } from "./client";
import { normalizeSearchResult } from "./media";

/* -------------------------------------------------------------------------- */
/*  Trending                                                                  */
/* -------------------------------------------------------------------------- */

export async function getTrending(
  client: TmdbClient,
  type: MediaType,
  opts?: SearchOpts,
): Promise<{
  results: SearchResult[];
  totalPages: number;
  totalResults: number;
}> {
  const endpoint =
    type === "movie" ? "/trending/movie/week" : "/trending/tv/week";
  const params: Record<string, string> = {};
  if (opts?.page) params.page = String(opts.page);
  if (opts?.language) params.language = opts.language;

  const data = await client.fetch<{
    results: unknown[];
    total_pages: number;
    total_results: number;
  }>(endpoint, params);

  return {
    results: data.results.map((r) => normalizeSearchResult(r, type)),
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}

/* -------------------------------------------------------------------------- */
/*  Trending with client-side filters (scans multiple pages)                  */
/* -------------------------------------------------------------------------- */

export async function getTrendingFiltered(
  client: TmdbClient,
  type: MediaType,
  opts?: {
    page?: number;
    genreIds?: number[];
    language?: string;
  },
): Promise<{
  results: SearchResult[];
  totalPages: number;
  totalResults: number;
}> {
  const endpoint =
    type === "movie" ? "/trending/movie/week" : "/trending/tv/week";
  const targetCount = 20;
  const maxPages = 5;
  const startPage = opts?.page ?? 1;
  const allResults: SearchResult[] = [];

  for (let p = startPage; p < startPage + maxPages; p++) {
    const params: Record<string, string> = { page: String(p) };

    const data = await client.fetch<{
      results: Array<Record<string, unknown>>;
      total_pages: number;
    }>(endpoint, params);

    if (data.results.length === 0) break;

    for (const raw of data.results) {
      const rawGenres = (raw.genre_ids ?? []) as number[];
      const origLang = raw.original_language as string;

      // Apply genre filter
      if (opts?.genreIds && opts.genreIds.length > 0) {
        if (!opts.genreIds.some((g) => rawGenres.includes(g))) continue;
      }
      // Apply language filter
      if (opts?.language && origLang !== opts.language) continue;

      allResults.push(normalizeSearchResult(raw, type));
    }

    if (allResults.length >= targetCount || p >= data.total_pages) break;
  }

  return {
    results: allResults.slice(0, targetCount),
    totalPages: Math.max(1, Math.ceil(allResults.length / targetCount)),
    totalResults: allResults.length,
  };
}

/* -------------------------------------------------------------------------- */
/*  Discover — translates camelCase DiscoverOpts → TMDB snake_case params     */
/* -------------------------------------------------------------------------- */

export async function discover(
  client: TmdbClient,
  type: MediaType,
  opts?: DiscoverOpts,
): Promise<{
  results: SearchResult[];
  totalPages: number;
  totalResults: number;
}> {
  const endpoint = type === "movie" ? "/discover/movie" : "/discover/tv";
  const params: Record<string, string> = {};
  if (opts?.page) params.page = String(opts.page);
  if (opts?.query) params.with_text_query = opts.query;
  if (opts?.genreIds) params.with_genres = opts.genreIds;
  if (opts?.withoutGenreIds) params.without_genres = opts.withoutGenreIds;
  if (opts?.originalLanguage)
    params.with_original_language = opts.originalLanguage;
  params.sort_by = opts?.sort_by ?? "popularity.desc";
  if (type === "show" && opts?.firstAirDateFrom) {
    params["first_air_date.gte"] = opts.firstAirDateFrom;
  }
  if (type === "movie" && opts?.releaseDateFrom) {
    params["primary_release_date.gte"] = opts.releaseDateFrom;
  }
  if (opts?.keywordIds) params.with_keywords = opts.keywordIds;
  if (opts?.minScore != null)
    params["vote_average.gte"] = String(opts.minScore);
  if (opts?.maxScore != null)
    params["vote_average.lte"] = String(opts.maxScore);
  if (opts?.maxRuntime != null)
    params["with_runtime.lte"] = String(opts.maxRuntime);
  if (type === "show" && opts?.firstAirDateTo)
    params["first_air_date.lte"] = opts.firstAirDateTo;
  if (type === "movie" && opts?.releaseDateTo)
    params["primary_release_date.lte"] = opts.releaseDateTo;
  if (opts?.certification) params.certification = opts.certification;
  if (opts?.certification_country)
    params.certification_country = opts.certification_country;
  if (opts?.with_status) params.with_status = opts.with_status;
  if (opts?.watchProviderIds)
    params.with_watch_providers = opts.watchProviderIds;
  if (opts?.watchRegion) params.watch_region = opts.watchRegion;
  if (opts?.minRuntime != null)
    params["with_runtime.gte"] = String(opts.minRuntime);

  const data = await client.fetch<{
    results: unknown[];
    total_pages: number;
    total_results: number;
  }>(endpoint, params);

  return {
    results: data.results.map((r) => normalizeSearchResult(r, type)),
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}
