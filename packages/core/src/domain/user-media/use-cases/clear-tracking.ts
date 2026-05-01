import type { Database } from "@canto/db/client";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import {
  getUserMediaState

} from "@canto/core/domain/user-media/use-cases/get-user-media-state";
import type {UserMediaStateResponse} from "@canto/core/domain/user-media/use-cases/get-user-media-state";
import { pushWatchStateToServers } from "@canto/core/domain/user-media/use-cases/push-watch-state";

export interface ClearTrackingDeps {
  repo: UserMediaRepositoryPort;
  logger: LoggerPort;
}

export interface ClearTrackingResult {
  success: true;
  state: UserMediaStateResponse;
}

export async function clearTracking(
  db: Database,
  deps: ClearTrackingDeps,
  userId: string,
  mediaId: string,
): Promise<ClearTrackingResult> {
  await deps.repo.upsertState({ userId, mediaId, status: "none" });

  void pushWatchStateToServers(db, userId, mediaId, false).catch(
    deps.logger.logAndSwallow("userMedia.clearTracking:pushWatchStateToServers"),
  );

  const state = await getUserMediaState(deps, userId, mediaId);
  return { success: true, state };
}
