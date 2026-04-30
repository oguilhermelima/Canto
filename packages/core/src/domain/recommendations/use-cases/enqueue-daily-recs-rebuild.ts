import type { RecommendationsRepositoryPort } from "@canto/core/domain/recommendations/ports/recommendations-repository.port";
import type { JobDispatcherPort } from "@canto/core/domain/shared/ports/job-dispatcher.port";

export interface EnqueueDailyRecsRebuildDeps {
  repo: RecommendationsRepositoryPort;
  jobs: JobDispatcherPort;
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
    await deps.jobs.rebuildUserRecs(userId);
  }
  return userIds.length;
}
