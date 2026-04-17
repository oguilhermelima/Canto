import type { SearchResult } from "../types";
import type { TmdbClient } from "./client";
import { normalizeSearchResult } from "./media";

export async function findByImdbId(
  client: TmdbClient,
  imdbId: string,
): Promise<SearchResult[]> {
  const data = await client.fetch<{
    movie_results: unknown[];
    tv_results: unknown[];
  }>(`/find/${imdbId}`, { external_source: "imdb_id" });

  const results: SearchResult[] = [];
  for (const r of data.movie_results ?? []) {
    results.push(normalizeSearchResult(r, "movie"));
  }
  for (const r of data.tv_results ?? []) {
    results.push(normalizeSearchResult(r, "show"));
  }
  return results;
}

export async function findByTvdbId(
  client: TmdbClient,
  tvdbId: number,
): Promise<SearchResult[]> {
  const data = await client.fetch<{
    movie_results: unknown[];
    tv_results: unknown[];
  }>(`/find/${tvdbId}`, { external_source: "tvdb_id" });

  const results: SearchResult[] = [];
  for (const r of data.movie_results ?? []) {
    results.push(normalizeSearchResult(r, "movie"));
  }
  for (const r of data.tv_results ?? []) {
    results.push(normalizeSearchResult(r, "show"));
  }
  return results;
}
