import type { Database } from "@canto/db/client";

import { IndexerSearchError, MediaNotFoundError } from "../errors";
import { detectQuality, detectSource } from "../rules/quality";
import { calculateConfidence } from "../rules/scoring";
import { detectLanguages, detectReleaseGroup, detectCodec } from "../rules/parsing";
import type { ConfidenceContext } from "../types/common";
import type { IndexerResult, SearchContext } from "../types/torrent";
import type { IndexerPort } from "../ports/indexer";
import {
  findMediaById,
  findBlocklistByMediaId,
} from "../../infrastructure/repositories";

export interface SearchResult {
  guid: string;
  title: string;
  size: number;
  publishDate: string;
  downloadUrl: string | null;
  magnetUrl: string | null;
  infoUrl: string | null;
  indexer: string;
  seeders: number;
  leechers: number;
  age: number;
  flags: string[];
  quality: string;
  source: string;
  confidence: number;
  categories: Array<{ id: number; name: string }>;
  languages: string[];
  indexerLanguage: string | null;
  releaseGroup: string | null;
  codec: string | null;
}

export interface PaginatedSearchResults {
  results: SearchResult[];
  page: number;
  pageSize: number;
  /** Whether indexers returned a full page (i.e. there's likely more) */
  hasMore: boolean;
}

export interface SearchInput {
  mediaId: string;
  query?: string;
  seasonNumber?: number;
  episodeNumbers?: number[] | null;
  page?: number;
  pageSize?: number;
}

export async function searchTorrents(
  db: Database,
  input: SearchInput,
  indexers: IndexerPort[],
): Promise<PaginatedSearchResults> {
  const row = await findMediaById(db, input.mediaId);

  if (!row) {
    throw new MediaNotFoundError(input.mediaId);
  }

  const page = input.page ?? 0;
  const pageSize = input.pageSize ?? 50;

  // Build text query — use custom query if provided (advanced search)
  const isCustomQuery = !!input.query;
  let query: string;
  if (isCustomQuery) {
    query = input.query!;
  } else {
    query = row.title;
    if (input.seasonNumber !== undefined) {
      const paddedSeason = String(input.seasonNumber).padStart(2, "0");
      if (
        input.episodeNumbers &&
        input.episodeNumbers.length === 1 &&
        input.episodeNumbers[0] !== undefined
      ) {
        const paddedEp = String(input.episodeNumbers[0]).padStart(2, "0");
        query += ` S${paddedSeason}E${paddedEp}`;
      } else {
        query += ` S${paddedSeason}`;
      }
    }
  }

  if (indexers.length === 0) {
    return { results: [], page, pageSize, hasMore: false };
  }

  // Build structured search context with external IDs + pagination
  // Custom queries use text-only search (no ID params) for maximum flexibility
  const ctx: SearchContext = {
    query,
    mediaType: row.type as "movie" | "show",
    // Custom queries skip ID-based search — use text only
    tmdbId: isCustomQuery ? undefined : (row.provider === "tmdb" ? row.externalId : undefined),
    imdbId: isCustomQuery ? undefined : (row.imdbId ?? undefined),
    tvdbId: isCustomQuery ? undefined : (row.tvdbId ?? undefined),
    seasonNumber: isCustomQuery ? undefined : input.seasonNumber,
    episodeNumbers: isCustomQuery ? undefined : (input.episodeNumbers ?? undefined),
    categories: row.type === "movie" ? [2000] : [5000],
    limit: pageSize,
    offset: page * pageSize,
  };

  const searches: Promise<IndexerResult[]>[] = indexers.map((idx) =>
    idx.search(ctx),
  );

  let results: IndexerResult[];
  try {
    const settled = await Promise.allSettled(searches);
    results = [];
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(...s.value);
    }
    // Deduplicate by title
    const seen = new Set<string>();
    results = results.filter((r) => {
      const key = r.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    throw new IndexerSearchError(`Indexer search failed: ${message}`);
  }

  // Filter out blocklisted titles
  const blockedRows = await findBlocklistByMediaId(db, input.mediaId);
  if (blockedRows.length > 0) {
    const blockedTitles = new Set(blockedRows.map((b) => b.title.toLowerCase()));
    results = results.filter((r) => !blockedTitles.has(r.title.toLowerCase()));
  }

  // Determine if media has a digital release
  const isShow = row.type === "show";
  const releaseDate = row.releaseDate ? new Date(row.releaseDate) : null;
  const monthsSinceRelease = releaseDate
    ? (Date.now() - releaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    : Infinity;
  const hasDigitalRelease = isShow || monthsSinceRelease > 3;

  const confidenceCtx: ConfidenceContext = { hasDigitalRelease };

  const scored = results
    .map((r) => {
      const flags = r.indexerFlags ?? [];
      const quality = detectQuality(r.title);
      const confidence = calculateConfidence(
        r.title, quality, flags, r.seeders, r.age ?? 0, confidenceCtx,
      );
      return {
        guid: r.guid,
        title: r.title,
        size: r.size,
        publishDate: r.publishDate,
        downloadUrl: r.downloadUrl,
        magnetUrl: r.magnetUrl,
        infoUrl: r.infoUrl,
        indexer: r.indexer,
        seeders: r.seeders,
        leechers: r.leechers,
        age: r.age ?? 0,
        flags,
        quality,
        source: detectSource(r.title),
        confidence,
        categories: r.categories,
        languages: detectLanguages(r.title),
        indexerLanguage: r.indexerLanguage ?? null,
        releaseGroup: detectReleaseGroup(r.title),
        codec: detectCodec(r.title),
      };
    })
    .filter((r) => r.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);

  // Truncate to pageSize and detect if there's more
  const hasMore = scored.length > pageSize;
  const truncated = scored.slice(0, pageSize);

  return { results: truncated, page, pageSize, hasMore };
}
