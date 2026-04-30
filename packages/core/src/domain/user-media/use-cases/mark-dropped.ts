import type { Database } from "@canto/db/client";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import { logAndSwallow } from "@canto/core/platform/logger/log-error";
import {
  getUserMediaState,
  type UserMediaStateResponse,
} from "@canto/core/domain/user-media/use-cases/get-user-media-state";
import { pushWatchStateToServers } from "@canto/core/domain/user-media/use-cases/push-watch-state";

export interface MarkDroppedDeps {
  repo: UserMediaRepositoryPort;
}

export interface MarkDroppedResult {
  success: true;
  state: UserMediaStateResponse;
}

export async function markDropped(
  db: Database,
  deps: MarkDroppedDeps,
  userId: string,
  mediaId: string,
): Promise<MarkDroppedResult> {
  await deps.repo.upsertState({ userId, mediaId, status: "dropped" });

  void pushWatchStateToServers(db, userId, mediaId, false).catch(
    logAndSwallow("userMedia.markDropped:pushWatchStateToServers"),
  );

  const state = await getUserMediaState(deps, userId, mediaId);
  return { success: true, state };
}
