import type {
  DiscoverOpts,
  MediaExtras,
  MediaType,
  MetadataOpts,
  MetadataProvider,
  NormalizedMedia,
  PersonDetail,
  SearchOpts,
  SearchResult,
  Translation,
} from "../types";
import { TmdbClient } from "./client";
import { discover, getTrending, getTrendingFiltered } from "./discover";
import { findByImdbId, findByTvdbId } from "./find";
import { getCertifications  } from "./certifications";
import type {CertificationEntry} from "./certifications";
import { getGenres } from "./genres";
import {
  getExtras,
  getImages,
  getMetadata,
  getTranslations,
  getVideos,
  search,
} from "./media";
import { getPerson } from "./person";

/**
 * TmdbProvider — thin class wrapper around TmdbClient that implements the
 * MetadataProvider contract. All behavior lives in per-concern modules.
 */
export class TmdbProvider implements MetadataProvider {
  name = "tmdb" as const;
  private client: TmdbClient;

  constructor(apiKey: string, language = "en-US") {
    this.client = new TmdbClient(apiKey, language);
  }

  /* ── Search ─────────────────────────────────────────────────────────── */

  search(
    query: string,
    type: MediaType,
    opts?: SearchOpts,
  ): Promise<{
    results: SearchResult[];
    totalPages: number;
    totalResults: number;
  }> {
    return search(this.client, query, type, opts);
  }

  /* ── Full metadata ──────────────────────────────────────────────────── */

  getMetadata(
    externalId: number,
    type: MediaType,
    opts?: MetadataOpts,
  ): Promise<NormalizedMedia> {
    return getMetadata(this.client, externalId, type, opts);
  }

  /* ── Find ───────────────────────────────────────────────────────────── */

  findByImdbId(imdbId: string): Promise<SearchResult[]> {
    return findByImdbId(this.client, imdbId);
  }

  findByTvdbId(tvdbId: number): Promise<SearchResult[]> {
    return findByTvdbId(this.client, tvdbId);
  }

  /* ── Extras ─────────────────────────────────────────────────────────── */

  getExtras(
    externalId: number,
    type: MediaType,
    opts?: { supportedLanguages?: string[] },
  ): Promise<MediaExtras> {
    return getExtras(this.client, externalId, type, opts);
  }

  /* ── Trending ───────────────────────────────────────────────────────── */

  getTrending(
    type: MediaType,
    opts?: SearchOpts,
  ): Promise<{
    results: SearchResult[];
    totalPages: number;
    totalResults: number;
  }> {
    return getTrending(this.client, type, opts);
  }

  getTrendingFiltered(
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
    return getTrendingFiltered(this.client, type, opts);
  }

  /* ── Discover ───────────────────────────────────────────────────────── */

  discover(
    type: MediaType,
    opts?: DiscoverOpts,
  ): Promise<{
    results: SearchResult[];
    totalPages: number;
    totalResults: number;
  }> {
    return discover(this.client, type, opts);
  }

  /* ── Genres ─────────────────────────────────────────────────────────── */

  getGenres(type: MediaType): Promise<Array<{ id: number; name: string }>> {
    return getGenres(this.client, type);
  }

  /* ── Certifications ─────────────────────────────────────────────────── */

  getCertifications(type: "movie" | "tv"): Promise<CertificationEntry[]> {
    return getCertifications(this.client, type);
  }

  /* ── Person ─────────────────────────────────────────────────────────── */

  getPerson(personId: number): Promise<PersonDetail> {
    return getPerson(this.client, personId);
  }

  /* ── Standalone translations / images / videos (pool-item helpers) ──── */

  getTranslations(
    id: number,
    type: "movie" | "tv",
    supportedLanguages?: string[],
  ): Promise<Translation[]> {
    return getTranslations(this.client, id, type, supportedLanguages);
  }

  getImages(
    id: number,
    type: "movie" | "tv",
  ): Promise<{
    logos: Array<{ file_path: string; iso_639_1: string | null }>;
  }> {
    return getImages(this.client, id, type);
  }

  getVideos(
    id: number,
    type: "movie" | "tv",
    supportedLanguages?: string[],
  ): Promise<
    Array<{ key: string; site: string; type: string; language?: string }>
  > {
    return getVideos(this.client, id, type, supportedLanguages);
  }
}
