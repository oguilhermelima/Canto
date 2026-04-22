import type { Database } from "@canto/db/client";

import { findUsersForDailyRecsCheck } from "../../../infra/recommendations/user-recommendation-repository";
import { dispatchRebuildUserRecs } from "../../../platform/queue/bullmq-dispatcher";

/**
 * Find every user whose recs have gone stale (null or >24h) and enqueue a
 * rebuild for each. Returns the number of users dispatched so the caller can
 * log a single summary line.
 */
export async function enqueueDailyRecsRebuild(db: Database): Promise<number> {
  const users = await findUsersForDailyRecsCheck(db);
  for (const u of users) {
    await dispatchRebuildUserRecs(u.id);
  }
  return users.length;
}
