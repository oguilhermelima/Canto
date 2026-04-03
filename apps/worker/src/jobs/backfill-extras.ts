import { sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media, mediaVideo, userRecommendation } from "@canto/db/schema";
import { dispatchRefreshExtras } from "@canto/api/infrastructure/queue/bullmq-dispatcher";

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
  const rows = await db
    .selectDistinctOn([media.id], { id: media.id, title: media.title })
    .from(userRecommendation)
    .innerJoin(media, sql`${media.id} = ${userRecommendation.mediaId}`)
    .where(
      sql`${userRecommendation.active} = true
        AND (${media.extrasUpdatedAt} IS NULL OR ${media.extrasUpdatedAt} < now() - interval '${sql.raw(String(STALE_DAYS))} days')
        AND (
          ${media.logoPath} IS NULL
          OR NOT EXISTS (SELECT 1 FROM ${mediaVideo} WHERE ${mediaVideo.mediaId} = ${media.id})
        )`,
    );

  if (rows.length === 0) return;

  console.log(`[backfill-extras] Dispatching ${rows.length} media for refresh`);
  for (const row of rows) {
    await dispatchRefreshExtras(row.id);
  }
}
