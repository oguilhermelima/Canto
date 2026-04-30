import type { Database } from "@canto/db/client";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import { logAndSwallow } from "@canto/core/platform/logger/log-error";
import {
  getUserMediaState,
  type UserMediaStateResponse,
} from "@canto/core/domain/user-media/use-cases/get-user-media-state";
import { pushWatchStateToServers } from "@canto/core/domain/user-media/use-cases/push-watch-state";

export interface ClearTrackingDeps {
  repo: UserMediaRepositoryPort;
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
    logAndSwallow("userMedia.clearTracking:pushWatchStateToServers"),
  );

  const state = await getUserMediaState(deps, userId, mediaId);
  return { success: true, state };
}
