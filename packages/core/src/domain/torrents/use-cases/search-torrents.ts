import type { Database } from "@canto/db/client";

import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import { MediaNotFoundError } from "@canto/core/domain/shared/errors";
import { resolveMediaFlavor } from "@canto/core/domain/shared/rules/media-flavor";
import {
  explainConfidence,
} from "@canto/core/domain/shared/rules/scoring";
import type { ConfidenceBreakdown } from "@canto/core/domain/shared/rules/scoring";
import type { ScoringRules } from "@canto/core/domain/shared/rules/scoring-rules";
import { IndexerSearchError } from "@canto/core/domain/torrents/errors";
import type { IndexerPort } from "@canto/core/domain/torrents/ports/indexer";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import {
  applyDownloadProfile,
  meetsCutoff,
} from "@canto/core/domain/torrents/rules/download-profile";
import type { DownloadProfile } from "@canto/core/domain/torrents/rules/download-profile";
import {
  matchesSearchIntent,
} from "@canto/core/domain/torrents/rules/parsing-episodes";
import type { SearchIntent } from "@canto/core/domain/torrents/rules/parsing-episodes";
import {
  parseReleaseAttributes,
} from "@canto/core/domain/torrents/rules/release-attributes";
import type { ReleaseAttributes } from "@canto/core/domain/torrents/rules/release-attributes";
import type {
  ReleaseFlavor,
  ReleaseGroupTierSets,
} from "@canto/core/domain/torrents/rules/release-groups";
import { extractHashFromMagnet } from "@canto/core/domain/torrents/rules/torrent-rules";
import type { ConfidenceContext } from "@canto/core/domain/torrents/types/common";
import type {
  IndexerResult,
  SearchContext,
} from "@canto/core/domain/torrents/types/torrent";

/**
 * Stable dedupe key. Prefers the magnet info-hash so the same release
 * picked up by two indexers collapses regardless of title casing /
 * trailing tag differences.
 */
function dedupeKey(r: { magnetUrl: string | null; title: string }): string {
  if (r.magnetUrl) {
    const hash = extractHashFromMagnet(r.magnetUrl);
    if (hash) return `hash:${hash}`;
  }
  return `title:${r.title.toLowerCase()}`;
}

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
  breakdown: ConfidenceBreakdown;
  /** True when this release meets or exceeds the active profile's cutoff. */
  aboveCutoff: boolean;
}

export interface PaginatedSearchResults {
  results: SearchResult[];
  page: number;
  pageSize: number;
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

const DEFAULT_PAGE_SIZE = 50;

interface PreparedSearch {
  ctx: SearchContext;
  queryVariants: string[];
  rules: ScoringRules;
  profile: DownloadProfile | null;
  confidenceCtx: ConfidenceContext;
  flavor: ReleaseFlavor;
  releaseGroupLookups: ReleaseGroupTierSets;
  blockedTitles: Set<string>;
  intent: SearchIntent | null;
  page: number;
  pageSize: number;
}

async function prepareSearch(
  deps: SearchDeps,
  input: SearchInput,
  rules: ScoringRules,
): Promise<PreparedSearch> {
  const [allLookups, row, blockedRows] = await Promise.all([
    deps.torrents.findReleaseGroupLookups(),
    deps.media.findById(input.mediaId),
    deps.torrents.findBlocklistByMediaId(input.mediaId),
  ]);
  if (!row) throw new MediaNotFoundError(input.mediaId);

  const page = input.page ?? 0;
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  const isCustomQuery = input.query !== undefined && input.query.length > 0;
  let query: string;
  if (isCustomQuery && input.query) {
    query = input.query;
  } else {
    const enLoc = await deps.localization.findOne(row.id, "en-US");
    query = enLoc?.title ?? "";
    if (input.seasonNumber !== undefined) {
      const paddedSeason = String(input.seasonNumber).padStart(2, "0");
      const eps = input.episodeNumbers;
      if (eps && eps.length === 1 && eps[0] !== undefined) {
        const paddedEp = String(eps[0]).padStart(2, "0");
        query += ` S${paddedSeason}E${paddedEp}`;
      } else {
        query += ` S${paddedSeason}`;
      }
    }
  }

  const ctx: SearchContext = {
    query,
    mediaType: row.type as "movie" | "show",
    tmdbId: isCustomQuery
      ? undefined
      : row.provider === "tmdb"
        ? row.externalId
        : undefined,
    imdbId: isCustomQuery ? undefined : (row.imdbId ?? undefined),
    tvdbId: isCustomQuery ? undefined : (row.tvdbId ?? undefined),
    seasonNumber: isCustomQuery ? undefined : input.seasonNumber,
    episodeNumbers: isCustomQuery
      ? undefined
      : (input.episodeNumbers ?? undefined),
    categories: row.type === "movie" ? [2000] : [5000],
    limit: pageSize,
    offset: page * pageSize,
  };

  const isShowFullScan =
    !isCustomQuery && row.type === "show" && input.seasonNumber === undefined;
  const queryVariants: string[] = isShowFullScan
    ? [query, `${query} Complete`]
    : [query];

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

  const profile = await deps.torrents.findActiveDownloadProfile({
    mediaDownloadProfileId: row.downloadProfileId ?? null,
    folderDownloadProfileId: null,
    flavor,
  });
  const activeRules: ScoringRules = profile
    ? applyDownloadProfile(rules, profile)
    : rules;

  const blockedTitles = new Set(blockedRows.map((b) => b.title.toLowerCase()));

  const intent: SearchIntent | null =
    !isCustomQuery && row.type === "show"
      ? {
          type: "show",
          seasonNumber: input.seasonNumber,
          episodeNumbers: input.episodeNumbers ?? null,
        }
      : null;

  return {
    ctx,
    queryVariants,
    rules: activeRules,
    profile,
    confidenceCtx,
    flavor,
    releaseGroupLookups: allLookups[flavor],
    blockedTitles,
    intent,
    page,
    pageSize,
  };
}

async function runOneIndexer(
  idx: IndexerPort,
  prep: PreparedSearch,
): Promise<IndexerResult[]> {
  const settled = await Promise.allSettled(
    prep.queryVariants.map((q) => idx.search({ ...prep.ctx, query: q })),
  );
  const out: IndexerResult[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") out.push(...s.value);
  }
  return out;
}

function scoreRawResults(
  raw: IndexerResult[],
  prep: PreparedSearch,
): SearchResult[] {
  const out: SearchResult[] = [];

  for (const r of raw) {
    if (prep.blockedTitles.has(r.title.toLowerCase())) continue;
    if (prep.intent && !matchesSearchIntent(r.title, prep.intent)) continue;

    const attrs = parseReleaseAttributes({
      title: r.title,
      seeders: r.seeders,
      age: r.age,
      flags: r.indexerFlags,
      flavor: prep.flavor,
      releaseGroupLookups: prep.releaseGroupLookups,
    });
    const breakdown = explainConfidence(attrs, prep.confidenceCtx, prep.rules);
    if (breakdown.score <= 0) continue;

    out.push({
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
      confidence: breakdown.score,
      breakdown,
      aboveCutoff: prep.profile
        ? meetsCutoff(prep.profile, attrs.quality, attrs.source)
        : false,
    });
  }

  return out;
}

export interface SearchDeps {
  indexers: IndexerPort[];
  rules: ScoringRules;
  torrents: TorrentsRepositoryPort;
  media: MediaRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
}

export async function searchTorrents(
  _db: Database,
  input: SearchInput,
  deps: SearchDeps,
): Promise<PaginatedSearchResults> {
  const { indexers, rules } = deps;
  const prep = await prepareSearch(deps, input, rules);

  if (indexers.length === 0) {
    return {
      results: [],
      page: prep.page,
      pageSize: prep.pageSize,
      hasMore: false,
    };
  }

  let raw: IndexerResult[];
  try {
    const indexerResults = await Promise.allSettled(
      indexers.map((idx) => runOneIndexer(idx, prep)),
    );
    raw = [];
    for (const r of indexerResults) {
      if (r.status === "fulfilled") raw.push(...r.value);
    }
    const seen = new Set<string>();
    raw = raw.filter((r) => {
      const key = dedupeKey(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new IndexerSearchError(`Indexer search failed: ${message}`);
  }

  const scored = scoreRawResults(raw, prep).sort(
    (a, b) => b.confidence - a.confidence,
  );

  const hasMore = scored.length > prep.pageSize;
  const truncated = scored.slice(0, prep.pageSize);
  return {
    results: truncated,
    page: prep.page,
    pageSize: prep.pageSize,
    hasMore,
  };
}

export interface SearchOnIndexerInput extends SearchInput {
  indexerId: string;
}

export interface IndexerSearchResult {
  indexer: { id: string; name: string };
  results: SearchResult[];
  /** Wall-clock duration of the indexer roundtrip + scoring, ms. */
  tookMs: number;
}

export async function searchOnIndexer(
  _db: Database,
  input: SearchOnIndexerInput,
  deps: SearchDeps,
): Promise<IndexerSearchResult> {
  const { indexers, rules } = deps;
  const idx = indexers.find((i) => i.id === input.indexerId);
  if (!idx) {
    return {
      indexer: { id: input.indexerId, name: input.indexerId },
      results: [],
      tookMs: 0,
    };
  }

  const prep = await prepareSearch(deps, input, rules);

  const start = Date.now();
  const raw = await runOneIndexer(idx, prep);
  const seen = new Set<string>();
  const deduped = raw.filter((r) => {
    const key = dedupeKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const scored = scoreRawResults(deduped, prep).sort(
    (a, b) => b.confidence - a.confidence,
  );

  return {
    indexer: { id: idx.id, name: idx.name },
    results: scored.slice(0, prep.pageSize),
    tookMs: Date.now() - start,
  };
}

export interface IndexerInfo {
  id: string;
  name: string;
}

export function listIndexerInfo(indexers: IndexerPort[]): IndexerInfo[] {
  return indexers.map((idx) => ({ id: idx.id, name: idx.name }));
}
