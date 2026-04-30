import type { Database } from "@canto/db/client";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import { logAndSwallow } from "@canto/core/platform/logger/log-error";
import { MediaNotFoundError } from "@canto/core/domain/shared/errors";
import {
  computeTrackingStatus,
  isMediaType,
  isReleasedOnOrBefore
  
} from "@canto/core/domain/user-media/rules/user-media-rules";
import type {MediaType} from "@canto/core/domain/user-media/rules/user-media-rules";
import {
  getUserMediaState
  
} from "@canto/core/domain/user-media/use-cases/get-user-media-state";
import type {UserMediaStateResponse} from "@canto/core/domain/user-media/use-cases/get-user-media-state";
import { pushWatchStateToServers } from "@canto/core/domain/user-media/use-cases/push-watch-state";

export interface RemoveHistoryEntriesDeps {
  repo: UserMediaRepositoryPort;
  mediaRepo: MediaRepositoryPort;
}

export interface RemoveHistoryEntriesInput {
  mediaId: string;
  entryIds: string[];
}

export interface RemoveHistoryEntriesResult {
  success: true;
  removedItems: number;
  state: UserMediaStateResponse;
}

export async function removeHistoryEntries(
  db: Database,
  deps: RemoveHistoryEntriesDeps,
  userId: string,
  input: RemoveHistoryEntriesInput,
): Promise<RemoveHistoryEntriesResult> {
  const media = await deps.mediaRepo.findByIdWithSeasons(input.mediaId);
  if (!media) throw new MediaNotFoundError(input.mediaId);

  const { count: removedItems, episodeIds: removedEpisodeIds } =
    await deps.repo.deleteHistoryByIds(userId, input.mediaId, [
      ...new Set(input.entryIds),
    ]);

  if (removedEpisodeIds.length > 0) {
    await deps.repo.softDeletePlayback(
      userId,
      input.mediaId,
      removedEpisodeIds,
    );
  }

  const now = new Date();
  const releasedEpisodeIds = new Set(
    media.seasons
      .flatMap((season) => season.episodes)
      .filter((episode) => isReleasedOnOrBefore(episode.airDate, now))
      .map((episode) => episode.id),
  );

  const history = await deps.repo.findHistoryByMedia(userId, input.mediaId);
  const mediaType: MediaType = isMediaType(media.type) ? media.type : "movie";
  const computedStatus = computeTrackingStatus({
    mediaType,
    history,
    releasedEpisodeIds,
  });

  await deps.repo.upsertState({
    userId,
    mediaId: input.mediaId,
    status: computedStatus,
  });

  if (history.length === 0) {
    void pushWatchStateToServers(db, userId, input.mediaId, false).catch(
      logAndSwallow("userMedia.removeHistoryEntries:pushWatchStateToServers"),
    );
  }

  const state = await getUserMediaState(deps, userId, input.mediaId);
  return {
    success: true,
    removedItems,
    state: {
      ...state,
      lastWatchedAt: state.lastWatchedAt ?? history[0]?.watchedAt ?? null,
    },
  };
}
