import type { RecommendationsRepositoryPort } from "@canto/core/domain/recommendations/ports/recommendations-repository.port";
import { dispatchRebuildUserRecs } from "@canto/core/platform/queue/bullmq-dispatcher";

export interface EnqueueDailyRecsRebuildDeps {
  repo: RecommendationsRepositoryPort;
}

/**
 * Find every user whose recs have gone stale (null or >24h) and enqueue a
 * rebuild for each. Returns the number of users dispatched so the caller can
 * log a single summary line.
 */
export async function enqueueDailyRecsRebuild(
  deps: EnqueueDailyRecsRebuildDeps,
): Promise<number> {
  const userIds = await deps.repo.findUsersForDailyRecsCheck();
  for (const userId of userIds) {
    await dispatchRebuildUserRecs(userId);
  }
  return userIds.length;
}
