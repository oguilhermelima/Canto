import type { Database } from "@canto/db/client";

import type { DownloadClientPort } from "../../shared/ports/download-client";
import type { ScoringRules } from "../../shared/rules/scoring-rules";
import type { IndexerPort } from "../ports/indexer";
import { findRecentImportedDownloads } from "../../../infra/torrents/download-repository";
import {
  autoSupersedeWithRepack,
  type AutoSupersedeOutcome,
} from "./auto-supersede";
import { searchTorrents, type SearchResult } from "./search-torrents";

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

  for (const row of candidates) {
    if (!row.mediaId) continue;
    outcome.scanned++;

    let results: SearchResult[];
    try {
      const out = await searchTorrents(
        db,
        {
          mediaId: row.mediaId,
          seasonNumber: row.seasonNumber ?? undefined,
          episodeNumbers: row.episodeNumbers ?? undefined,
          pageSize: 50,
        },
        deps.indexers,
        deps.rules,
      );
      results = out.results;
    } catch (err) {
      outcome.failures.push({
        downloadId: row.id,
        title: row.title,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const best = pickBestRepack(results, row.repackCount);
    if (!best) continue;

    let supersede: AutoSupersedeOutcome;
    try {
      supersede = await autoSupersedeWithRepack(
        db,
        { currentDownloadId: row.id, candidate: best },
        deps.qbClient,
      );
    } catch (err) {
      outcome.failures.push({
        downloadId: row.id,
        title: row.title,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (supersede.replaced) {
      outcome.replaced++;
      outcome.replacements.push({
        downloadId: row.id,
        oldTitle: row.title,
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
