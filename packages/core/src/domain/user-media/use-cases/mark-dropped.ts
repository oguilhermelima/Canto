import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { MediaServerPushPort } from "@canto/core/domain/user-media/ports/media-server-push.port";
import {
  getUserMediaState,
} from "@canto/core/domain/user-media/use-cases/get-user-media-state";
import type { UserMediaStateResponse } from "@canto/core/domain/user-media/use-cases/get-user-media-state";

export interface MarkDroppedDeps {
  repo: UserMediaRepositoryPort;
  logger: LoggerPort;
  push: MediaServerPushPort;
}

export interface MarkDroppedResult {
  success: true;
  state: UserMediaStateResponse;
}

export async function markDropped(
  deps: MarkDroppedDeps,
  userId: string,
  mediaId: string,
): Promise<MarkDroppedResult> {
  await deps.repo.upsertState({ userId, mediaId, status: "dropped" });

  void deps.push.pushWatchState(userId, mediaId, false).catch(
    deps.logger.logAndSwallow("userMedia.markDropped:pushWatchStateToServers"),
  );

  const state = await getUserMediaState(deps, userId, mediaId);
  return { success: true, state };
}
