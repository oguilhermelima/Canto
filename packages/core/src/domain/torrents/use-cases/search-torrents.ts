import type { Database } from "@canto/db/client";

import { IndexerSearchError } from "@canto/core/domain/torrents/errors";
import { MediaNotFoundError } from "@canto/core/domain/shared/errors";
import { calculateConfidence } from "../../shared/rules/scoring";
import {
  DEFAULT_SCORING_RULES,
  type ScoringRules,
} from "../../shared/rules/scoring-rules";
import { resolveMediaFlavor } from "../../shared/rules/media-flavor";
import {
  parseReleaseAttributes,
  type ReleaseAttributes,
} from "../rules/release-attributes";
import {
  applyQualityProfile,
  meetsCutoff,
  type QualityProfile,
} from "../rules/quality-profile";
import type { ConfidenceContext } from "../types/common";
import type { IndexerResult, SearchContext } from "../types/torrent";
import type { IndexerPort } from "../ports/indexer";
import {
  findMediaById,
  findBlocklistByMediaId,
} from "../../../infra/repositories";
import { findActiveQualityProfile } from "../../../infra/torrents/quality-profile-repository";

export interface SearchResult extends ReleaseAttributes {
  guid: string;
  size: number;
  publishDate: string;
  downloadUrl: string | null;
  magnetUrl: string | null;
  infoUrl: string | null;
  indexer: string;
  leechers: number;
  categories: Array<{ id: number; name: string }>;
  indexerLanguage: string | null;
  confidence: number;
  /** True when this release meets or exceeds the active profile's cutoff.
   *  False when the profile has no cutoff or the release falls below.
   *  Drives upgrade-flow decisions and the UI cutoff badge. */
  aboveCutoff: boolean;
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
  /** Per-call scoring rules. Callers that have a user context (the tRPC
   *  search procedure) layer the user's download preferences on top of
   *  the defaults via {@link applyDownloadPreferences}. Background jobs
   *  with no user (continuous-download, rss-sync) fall through to the
   *  defaults. */
  rules: ScoringRules = DEFAULT_SCORING_RULES,
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

  // For full-show searches (no season/episode and not a custom query), fan
  // out an extra query with " Complete" appended. Some indexers index
  // season packs under that token rather than the bare title; combining
  // the two surfaces packs that the bare title misses without losing the
  // bare-title results. Dedup by title catches overlap.
  const isShowFullScan =
    !isCustomQuery &&
    row.type === "show" &&
    input.seasonNumber === undefined;

  const queryVariants: string[] = isShowFullScan
    ? [query, `${query} Complete`]
    : [query];

  const searches: Promise<IndexerResult[]>[] = queryVariants.flatMap((q) =>
    indexers.map((idx) => idx.search({ ...ctx, query: q })),
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
  const flavor = resolveMediaFlavor({
    type: row.type as "movie" | "show",
    originCountry: row.originCountry,
    originalLanguage: row.originalLanguage,
    genres: row.genres,
    genreIds: row.genreIds,
  });

  // Resolve and apply the active quality profile. When media has its
  // qualityProfileId snapshotted (post-add) we use that; otherwise fall
  // back to the system default for the flavor. Phase 5+ may layer
  // folder.qualityProfileId between the two.
  const profile = await findActiveQualityProfile(db, {
    mediaQualityProfileId: row.qualityProfileId ?? null,
    folderQualityProfileId: null,
    flavor,
  });
  const activeRules: ScoringRules = profile
    ? applyQualityProfile(rules, profile)
    : rules;

  const scored: SearchResult[] = results
    .map((r) => {
      const attrs = parseReleaseAttributes({
        title: r.title,
        seeders: r.seeders,
        age: r.age ?? 0,
        flags: r.indexerFlags ?? [],
        flavor,
      });
      return {
        ...attrs,
        guid: r.guid,
        size: r.size,
        publishDate: r.publishDate,
        downloadUrl: r.downloadUrl,
        magnetUrl: r.magnetUrl,
        infoUrl: r.infoUrl,
        indexer: r.indexer,
        leechers: r.leechers,
        categories: r.categories,
        indexerLanguage: r.indexerLanguage ?? null,
        confidence: calculateConfidence(attrs, confidenceCtx, activeRules),
        aboveCutoff: profile
          ? meetsCutoff(profile, attrs.quality, attrs.source)
          : false,
      };
    })
    .filter((r) => r.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);

  // Truncate to pageSize and detect if there's more
  const hasMore = scored.length > pageSize;
  const truncated = scored.slice(0, pageSize);

  return { results: truncated, page, pageSize, hasMore };
}
