import type { Database } from "@canto/db/client";

import { IndexerSearchError } from "@canto/core/domain/torrents/errors";
import { MediaNotFoundError } from "@canto/core/domain/shared/errors";
import { calculateConfidence } from "../../shared/rules/scoring";
import type { ScoringRules } from "../../shared/rules/scoring-rules";
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
import type {
  ReleaseFlavor,
  ReleaseGroupTierSets,
} from "../rules/release-groups";
import type { ConfidenceContext } from "../types/common";
import type { IndexerResult, SearchContext } from "../types/torrent";
import type { IndexerPort } from "../ports/indexer";
import {
  findMediaById,
  findBlocklistByMediaId,
} from "../../../infra/repositories";
import { findActiveQualityProfile } from "../../../infra/torrents/quality-profile-repository";
import { findReleaseGroupLookups } from "../../../infra/torrents/download-config-repository";

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

/* ─── Shared prep + scoring helpers ─── */

/**
 * Everything a search needs that *isn't* the indexer roundtrip itself.
 * Built once per search invocation so per-indexer fan-out (Phase 6b) can
 * reuse it cheaply across parallel calls.
 */
interface PreparedSearch {
  ctx: SearchContext;
  queryVariants: string[];
  rules: ScoringRules;
  profile: QualityProfile | null;
  confidenceCtx: ConfidenceContext;
  flavor: ReleaseFlavor;
  releaseGroupLookups: ReleaseGroupTierSets;
  blockedTitles: Set<string>;
  page: number;
  pageSize: number;
}

async function prepareSearch(
  db: Database,
  input: SearchInput,
  rules: ScoringRules,
): Promise<PreparedSearch> {
  const allLookups = await findReleaseGroupLookups(db);
  const row = await findMediaById(db, input.mediaId);
  if (!row) throw new MediaNotFoundError(input.mediaId);

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

  const ctx: SearchContext = {
    query,
    mediaType: row.type as "movie" | "show",
    tmdbId: isCustomQuery ? undefined : (row.provider === "tmdb" ? row.externalId : undefined),
    imdbId: isCustomQuery ? undefined : (row.imdbId ?? undefined),
    tvdbId: isCustomQuery ? undefined : (row.tvdbId ?? undefined),
    seasonNumber: isCustomQuery ? undefined : input.seasonNumber,
    episodeNumbers: isCustomQuery ? undefined : (input.episodeNumbers ?? undefined),
    categories: row.type === "movie" ? [2000] : [5000],
    limit: pageSize,
    offset: page * pageSize,
  };

  // Full-show fan-out: also fire `${title} Complete` so indexers that
  // index season packs under that token aren't missed. Dedupe-by-title
  // collapses overlap.
  const isShowFullScan =
    !isCustomQuery &&
    row.type === "show" &&
    input.seasonNumber === undefined;
  const queryVariants: string[] = isShowFullScan
    ? [query, `${query} Complete`]
    : [query];

  // Determine if media has a digital release (drives CAM penalty)
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

  // Resolve and apply the active quality profile. media.qualityProfileId
  // wins (snapshot-on-add); fallback to system default per flavor.
  // Phase 5+ may layer folder.qualityProfileId between the two.
  const profile = await findActiveQualityProfile(db, {
    mediaQualityProfileId: row.qualityProfileId ?? null,
    folderQualityProfileId: null,
    flavor,
  });
  const activeRules: ScoringRules = profile
    ? applyQualityProfile(rules, profile)
    : rules;

  // Blocklist
  const blockedRows = await findBlocklistByMediaId(db, input.mediaId);
  const blockedTitles = new Set(
    blockedRows.map((b) => b.title.toLowerCase()),
  );

  return {
    ctx,
    queryVariants,
    rules: activeRules,
    profile,
    confidenceCtx,
    flavor,
    releaseGroupLookups: allLookups[flavor],
    blockedTitles,
    page,
    pageSize,
  };
}

/**
 * Run a single indexer with the prepared context, for every query
 * variant, and concatenate the raw results. Errors are swallowed —
 * caller decides whether one indexer's failure is fatal.
 */
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

/**
 * Score the raw indexer results against the prepared profile + rules,
 * filtering out blocked titles and zero-confidence releases. Caller
 * decides ordering (per-indexer streaming may want chronological;
 * batch wants confidence-sorted).
 */
function scoreRawResults(
  raw: IndexerResult[],
  prep: PreparedSearch,
): SearchResult[] {
  const out: SearchResult[] = [];

  for (const r of raw) {
    if (prep.blockedTitles.has(r.title.toLowerCase())) continue;

    const attrs = parseReleaseAttributes({
      title: r.title,
      seeders: r.seeders,
      age: r.age ?? 0,
      flags: r.indexerFlags ?? [],
      flavor: prep.flavor,
      releaseGroupLookups: prep.releaseGroupLookups,
    });
    const confidence = calculateConfidence(
      attrs,
      prep.confidenceCtx,
      prep.rules,
    );
    if (confidence <= 0) continue;

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
      confidence,
      aboveCutoff: prep.profile
        ? meetsCutoff(prep.profile, attrs.quality, attrs.source)
        : false,
    });
  }

  return out;
}

/* ─── Public use-cases ─── */

export async function searchTorrents(
  db: Database,
  input: SearchInput,
  indexers: IndexerPort[],
  /** Per-call scoring rules. Callers that have a user context (the tRPC
   *  search procedure) layer the user's download preferences on top of
   *  the admin config via {@link applyDownloadPreferences}. Background
   *  jobs with no user (continuous-download, rss-sync) pass the admin
   *  config rules untouched — see {@link findDownloadConfig}. */
  rules: ScoringRules,
): Promise<PaginatedSearchResults> {
  const prep = await prepareSearch(db, input, rules);

  if (indexers.length === 0) {
    return { results: [], page: prep.page, pageSize: prep.pageSize, hasMore: false };
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
    // Dedupe by title across indexers
    const seen = new Set<string>();
    raw = raw.filter((r) => {
      const key = r.title.toLowerCase();
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
  return { results: truncated, page: prep.page, pageSize: prep.pageSize, hasMore };
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

/**
 * Single-indexer search. Used by the per-indexer streaming UI (Phase 6b)
 * via tRPC `useQueries` — each enabled indexer becomes its own query so
 * the modal lights up chips as each one responds rather than waiting for
 * the slowest.
 *
 * Reuses the same prep + scoring helpers as {@link searchTorrents}; the
 * only difference is who orchestrates the fan-out (server here vs
 * client).
 */
export async function searchOnIndexer(
  db: Database,
  input: SearchOnIndexerInput,
  indexers: IndexerPort[],
  rules: ScoringRules,
): Promise<IndexerSearchResult> {
  const idx = indexers.find((i) => i.id === input.indexerId);
  if (!idx) {
    return {
      indexer: { id: input.indexerId, name: input.indexerId },
      results: [],
      tookMs: 0,
    };
  }

  const prep = await prepareSearch(db, input, rules);

  const start = Date.now();
  const raw = await runOneIndexer(idx, prep);
  // Dedupe within this indexer (same release returned twice across
  // query variants — e.g. bare title + " Complete")
  const seen = new Set<string>();
  const deduped = raw.filter((r) => {
    const key = r.title.toLowerCase();
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

/**
 * Snapshot of every enabled indexer's id + display name. Used by the
 * Phase 6b streaming UI to render one chip per indexer before any
 * search fires.
 */
export function listIndexerInfo(indexers: IndexerPort[]): IndexerInfo[] {
  return indexers.map((idx) => ({ id: idx.id, name: idx.name }));
}
