import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@canto/db/client";
import { download } from "@canto/db/schema";

import { searchTorrents } from "@canto/core/domain/torrents/use-cases/search-torrents";
import { autoSupersedeWithRepack } from "@canto/core/domain/torrents/use-cases/auto-supersede";
import { applyAdminDownloadPolicy } from "@canto/core/domain/shared/rules/scoring-rules";
import { findDownloadConfig } from "@canto/core/infra/torrents/download-config-repository";
import { buildIndexers } from "@canto/core/infra/indexers/indexer-factory";
import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";

/**
 * Repack auto-supersede.
 *
 * Scans recently-imported downloads for repack upgrades. For each, runs
 * an admin-scope search and lets {@link autoSupersedeWithRepack} decide
 * whether any candidate is a strict-enough match to warrant replacing
 * the file on disk. Idempotent against the persisted `repackCount` —
 * once a download is on REPACK1 we won't re-supersede with REPACK1.
 *
 * Looks back 14 days. Anything older is unlikely to get a fresh repack
 * (REPACK runs lag the original by days, not weeks), so we cap the
 * indexer fan-out at the freshest cohort.
 */
const LOOKBACK_DAYS = 14;
const MAX_DOWNLOADS_PER_RUN = 50;

export async function handleRepackSupersede(): Promise<void> {
  let indexers;
  try {
    indexers = await buildIndexers();
  } catch (err) {
    console.warn(
      "[repack-supersede] indexers unavailable:",
      err instanceof Error ? err.message : err,
    );
    return;
  }
  if (indexers.length === 0) return;

  let qbClient;
  try {
    qbClient = await getDownloadClient();
  } catch {
    return; // Client not configured
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await db.query.download.findMany({
    where: and(
      eq(download.imported, true),
      gt(download.createdAt, since),
    ),
    orderBy: [desc(download.createdAt)],
    limit: MAX_DOWNLOADS_PER_RUN,
  });

  if (candidates.length === 0) return;

  const config = await findDownloadConfig(db);
  const rules = applyAdminDownloadPolicy(config.rules, config.policy);

  let scanned = 0;
  let replaced = 0;
  const skipReasons = new Map<string, number>();

  for (const row of candidates) {
    if (!row.mediaId) continue;
    scanned++;

    let searchResults;
    try {
      const out = await searchTorrents(
        db,
        {
          mediaId: row.mediaId,
          seasonNumber: row.seasonNumber ?? undefined,
          episodeNumbers: row.episodeNumbers ?? undefined,
          pageSize: 50,
        },
        indexers,
        rules,
      );
      searchResults = out.results;
    } catch (err) {
      console.warn(
        `[repack-supersede] search failed for "${row.title}":`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }

    // Pick the candidate with the highest repackCount that still beats
    // the current row. Ties broken by confidence.
    let best: (typeof searchResults)[number] | null = null;
    for (const r of searchResults) {
      if (r.repackCount <= row.repackCount) continue;
      if (!best || r.repackCount > best.repackCount) {
        best = r;
      } else if (r.repackCount === best.repackCount && r.confidence > best.confidence) {
        best = r;
      }
    }
    if (!best) continue;

    try {
      const outcome = await autoSupersedeWithRepack(
        db,
        { currentDownloadId: row.id, candidate: best },
        qbClient,
      );
      if (outcome.replaced) {
        replaced++;
        console.log(
          `[repack-supersede] superseded "${row.title}" with REPACK${best.repackCount} "${best.title}"`,
        );
      } else {
        skipReasons.set(outcome.reason, (skipReasons.get(outcome.reason) ?? 0) + 1);
      }
    } catch (err) {
      console.warn(
        `[repack-supersede] supersede failed for "${row.title}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (scanned > 0 || replaced > 0) {
    const skips = [...skipReasons.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(
      `[repack-supersede] scanned=${scanned} replaced=${replaced}${skips ? ` skips=${skips}` : ""}`,
    );
  }
}
