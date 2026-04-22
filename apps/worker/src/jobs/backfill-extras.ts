import type { Database } from "@canto/db/client";
import { dispatchRefreshExtras } from "@canto/core/platform/queue/bullmq-dispatcher";
import { findMediaNeedingExtrasBackfill } from "@canto/core/infra/repositories";

const STALE_DAYS = 7;

/**
 * Finds media in active recommendations missing logos or videos,
 * and enqueues refresh-extras jobs for each.
 *
 * Items refreshed in the last 7 days are skipped to avoid
 * hammering TMDB for media that genuinely has no extras.
 *
 * No batch limit — each ID is dispatched to the refresh-extras queue
 * which handles concurrency (2) and deduplication via jobId.
 */
export async function handleBackfillExtras(db: Database): Promise<void> {
  const rows = await findMediaNeedingExtrasBackfill(db, { staleDays: STALE_DAYS });
  if (rows.length === 0) return;

  console.log(`[backfill-extras] Dispatching ${rows.length} media for refresh`);
  for (const row of rows) {
    await dispatchRefreshExtras(row.id);
  }
}
