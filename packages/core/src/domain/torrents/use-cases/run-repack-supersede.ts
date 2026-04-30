import type { Database } from "@canto/db/client";

import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { ScoringRules } from "@canto/core/domain/shared/rules/scoring-rules";
import type { IndexerPort } from "@canto/core/domain/torrents/ports/indexer";
import { findRecentImportedDownloads } from "@canto/core/infra/torrents/download-repository";
import { runWithConcurrency } from "@canto/core/platform/concurrency/run-with-concurrency";
import {
  autoSupersedeWithRepack,
  type AutoSupersedeOutcome,
} from "@canto/core/domain/torrents/use-cases/auto-supersede";
import {
  searchTorrents,
  type SearchResult,
} from "@canto/core/domain/torrents/use-cases/search-torrents";

export interface RunRepackSupersedeOpts {
  /** How far back to scan for imported downloads. */
  lookbackDays?: number;
  /** Cap on candidates inspected per run — limits indexer fan-out. */
  maxPerRun?: number;
}

export interface RepackSupersedeOutcome {
  scanned: number;
  replaced: number;
  /** Counts of skip reasons emitted by `autoSupersedeWithRepack`. */
  skips: Record<string, number>;
  /** Per-row failures with the original error message. */
  failures: Array<{ downloadId: string; title: string; error: string }>;
  /** Pairs of (oldTitle, repackTitle) for each successful supersede.
   *  Lets the caller emit a notification or log line per replacement
   *  without rebuilding the data. */
  replacements: Array<{
    downloadId: string;
    oldTitle: string;
    newTitle: string;
    newRepackCount: number;
  }>;
}

interface Deps {
  indexers: IndexerPort[];
  qbClient: DownloadClientPort;
  rules: ScoringRules;
}

const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_MAX_PER_RUN = 50;
/** Prowlarr/Jackett rate limits make >4 concurrent searches counter-productive. */
const SEARCH_CONCURRENCY = 4;

/**
 * Scan recently-imported downloads for repack upgrades and replace each
 * one whose strict repack candidate exists. The strict gate lives in
 * {@link autoSupersedeWithRepack}; this orchestrator only picks the best
 * candidate per row (highest repackCount, ties broken by confidence).
 *
 * Returns aggregated stats so the caller (the BullMQ handler today, a
 * scheduled report tomorrow) can log or notify without re-walking.
 */
export async function runRepackSupersede(
  db: Database,
  deps: Deps,
  opts: RunRepackSupersedeOpts = {},
): Promise<RepackSupersedeOutcome> {
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const maxPerRun = opts.maxPerRun ?? DEFAULT_MAX_PER_RUN;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const candidates = await findRecentImportedDownloads(db, since, maxPerRun);
  const outcome: RepackSupersedeOutcome = {
    scanned: 0,
    replaced: 0,
    skips: {},
    failures: [],
    replacements: [],
  };
  if (candidates.length === 0) return outcome;

  // Drop candidates that can't be scanned, so the concurrency cap doesn't
  // get spent on no-ops.
  const scannable = candidates.filter((row) => row.mediaId != null);
  outcome.scanned = scannable.length;

  // Phase 1 — fan out the indexer searches (rate-limited at SEARCH_CONCURRENCY).
  type SearchOutcome =
    | { row: (typeof scannable)[number]; results: SearchResult[]; error: null }
    | { row: (typeof scannable)[number]; results: null; error: string };

  const searchOutcomes = await runWithConcurrency<
    (typeof scannable)[number],
    SearchOutcome
  >(scannable, SEARCH_CONCURRENCY, async (row) => {
    try {
      const out = await searchTorrents(
        db,
        {
          mediaId: row.mediaId!,
          seasonNumber: row.seasonNumber ?? undefined,
          episodeNumbers: row.episodeNumbers ?? undefined,
          pageSize: 50,
        },
        { indexers: deps.indexers, rules: deps.rules },
      );
      return { row, results: out.results, error: null };
    } catch (err) {
      return {
        row,
        results: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // Phase 2 — apply supersedes sequentially. autoSupersedeWithRepack writes to
  // qBit + DB; parallelizing it would risk racing on the same hash slot.
  for (const item of searchOutcomes) {
    if (item.error !== null) {
      outcome.failures.push({
        downloadId: item.row.id,
        title: item.row.title,
        error: item.error,
      });
      continue;
    }

    const best = pickBestRepack(item.results, item.row.repackCount);
    if (!best) continue;

    let supersede: AutoSupersedeOutcome;
    try {
      supersede = await autoSupersedeWithRepack(
        db,
        { currentDownloadId: item.row.id, candidate: best },
        deps.qbClient,
      );
    } catch (err) {
      outcome.failures.push({
        downloadId: item.row.id,
        title: item.row.title,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (supersede.replaced) {
      outcome.replaced++;
      outcome.replacements.push({
        downloadId: item.row.id,
        oldTitle: item.row.title,
        newTitle: best.title,
        newRepackCount: best.repackCount,
      });
    } else {
      outcome.skips[supersede.reason] =
        (outcome.skips[supersede.reason] ?? 0) + 1;
    }
  }

  return outcome;
}

function pickBestRepack(
  results: SearchResult[],
  currentRepackCount: number,
): SearchResult | null {
  let best: SearchResult | null = null;
  for (const r of results) {
    if (r.repackCount <= currentRepackCount) continue;
    if (!best) {
      best = r;
      continue;
    }
    if (r.repackCount > best.repackCount) {
      best = r;
    } else if (
      r.repackCount === best.repackCount &&
      r.confidence > best.confidence
    ) {
      best = r;
    }
  }
  return best;
}
