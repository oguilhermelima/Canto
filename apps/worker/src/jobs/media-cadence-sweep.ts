import { db } from "@canto/db/client";
import { findEligibleMediaIds } from "@canto/core/infra/media/media-aspect-state-repository";
import { dispatchEnsureMedia } from "@canto/core/platform/queue/bullmq-dispatcher";

import type { JobLogger } from "../lib/job-logger";

const SWEEP_BATCH = 500;

/**
 * Periodic sweep — finds media whose `media_aspect_state` rows are due
 * (next_eligible_at <= now) and fans out `ensureMedia` jobs. The cadence
 * engine inside ensureMedia decides which aspects to refresh per run; this
 * sweep just makes sure due media gets picked up without waiting for a
 * user-triggered preview/library action.
 *
 * Replaces the old `backfill-extras` cron, which queried only logo/video
 * gaps. Aspect-state covers every aspect (metadata, structure, translations,
 * logos, extras, contentRatings) with one query.
 */
export async function handleMediaCadenceSweep(log: JobLogger): Promise<void> {
  const ids = await findEligibleMediaIds(db, { limit: SWEEP_BATCH });
  if (ids.length === 0) return;
  await Promise.all(ids.map((id) => dispatchEnsureMedia(id)));
  log.info({ enqueued: ids.length }, "swept");
}
