import type { Database } from "@canto/db/client";
import { logAndSwallow } from "../../../lib/log-error";
import {
  deleteUserWatchHistoryByIds,
  findMediaByIdWithSeasons,
  findUserWatchHistoryByMedia,
  softDeleteUserPlaybackProgress,
  upsertUserMediaState,
} from "../../../infrastructure/repositories";
import { MediaNotFoundError } from "../../errors";
import {
  computeTrackingStatus,
  isMediaType,
  isReleasedOnOrBefore,
  type MediaType,
} from "../../rules/user-media-rules";
import {
  getUserMediaState,
  type UserMediaStateResponse,
} from "./get-user-media-state";
import { pushWatchStateToServers } from "./push-watch-state";

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
  userId: string,
  input: RemoveHistoryEntriesInput,
): Promise<RemoveHistoryEntriesResult> {
  const media = await findMediaByIdWithSeasons(db, input.mediaId);
  if (!media) throw new MediaNotFoundError(input.mediaId);

  const { count: removedItems, episodeIds: removedEpisodeIds } =
    await deleteUserWatchHistoryByIds(db, userId, input.mediaId, [
      ...new Set(input.entryIds),
    ]);

  if (removedEpisodeIds.length > 0) {
    await softDeleteUserPlaybackProgress(
      db,
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

  const history = await findUserWatchHistoryByMedia(db, userId, input.mediaId);
  const mediaType: MediaType = isMediaType(media.type) ? media.type : "movie";
  const computedStatus = computeTrackingStatus({
    mediaType,
    history,
    releasedEpisodeIds,
  });

  await upsertUserMediaState(db, {
    userId,
    mediaId: input.mediaId,
    status: computedStatus,
  });

  if (history.length === 0) {
    void pushWatchStateToServers(db, userId, input.mediaId, false).catch(
      logAndSwallow("userMedia.removeHistoryEntries:pushWatchStateToServers"),
    );
  }

  const state = await getUserMediaState(db, userId, input.mediaId);
  return {
    success: true,
    removedItems,
    state: {
      ...state,
      lastWatchedAt: state.lastWatchedAt ?? history[0]?.watchedAt ?? null,
    },
  };
}
