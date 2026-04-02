/**
 * Map a search result into media-compatible fields for recommendation items.
 */

import type { SearchResult } from "@canto/providers";

export function mapSearchResultToMediaFields(
  result: SearchResult,
  sourceType: "similar" | "recommendation",
  extras?: { logoPath?: string },
) {
  return {
    externalId: result.externalId,
    provider: result.provider ?? "tmdb",
    type: result.type,
    title: result.title,
    overview: result.overview,
    posterPath: result.posterPath,
    backdropPath: result.backdropPath,
    logoPath: extras?.logoPath ?? null,
    releaseDate: result.releaseDate || null,
    voteAverage: result.voteAverage,
    sourceType,
  };
}
