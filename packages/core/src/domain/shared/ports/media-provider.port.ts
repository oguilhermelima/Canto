import type {
  DiscoverOpts,
  MediaExtras,
  MediaType,
  MetadataOpts,
  NormalizedMedia,
  SearchOpts,
  SearchResult,
  Translation,
} from "@canto/providers";

/**
 * Abstract port for metadata providers (TMDB, TVDB, etc.).
 *
 * Core methods (`getMetadata`, `search`, `getExtras`, `getTrending`,
 * `discover`) are required. TMDB-specific helpers (`findByImdbId`,
 * `getTranslations`, `getVideos`, `getImages`) are optional — only
 * TmdbProvider implements them.
 */
export interface MediaProviderPort {
  getMetadata(
    externalId: number,
    type: MediaType,
    opts?: MetadataOpts,
  ): Promise<NormalizedMedia>;

  search(
    query: string,
    type: MediaType,
    opts?: SearchOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }>;

  getExtras(
    externalId: number,
    type: MediaType,
    opts?: { supportedLanguages?: string[] },
  ): Promise<MediaExtras>;

  getTrending(
    type: MediaType,
    opts?: SearchOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }>;

  discover(
    type: MediaType,
    opts?: DiscoverOpts,
  ): Promise<{ results: SearchResult[]; totalPages: number; totalResults: number }>;

  findByImdbId?(imdbId: string): Promise<SearchResult[]>;

  findByTvdbId?(tvdbId: number): Promise<SearchResult[]>;

  getTranslations?(
    id: number,
    type: "movie" | "tv",
    supportedLanguages?: string[],
  ): Promise<Translation[]>;

  getVideos?(
    id: number,
    type: "movie" | "tv",
    supportedLanguages?: string[],
  ): Promise<Array<{ key: string; site: string; type: string; language?: string }>>;

  getImages?(
    id: number,
    type: "movie" | "tv",
  ): Promise<{ logos: Array<{ file_path: string; iso_639_1: string | null }> }>;
}
