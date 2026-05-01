import type { Database } from "@canto/db/client";
import type { MediaServerPushPort } from "@canto/core/domain/user-media/ports/media-server-push.port";
import { pushPlaybackPositionToServers } from "@canto/core/domain/user-media/use-cases/push-playback-position";
import type { PushPlaybackPositionDeps } from "@canto/core/domain/user-media/use-cases/push-playback-position";
import { pushWatchStateToServers } from "@canto/core/domain/user-media/use-cases/push-watch-state";
import type { PushWatchStateDeps } from "@canto/core/domain/user-media/use-cases/push-watch-state";
import { jellyfinMediaServer } from "@canto/core/infra/media-servers/jellyfin-server.adapter";
import { plexMediaServer } from "@canto/core/infra/media-servers/plex-server.adapter";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makeMediaVersionRepository } from "@canto/core/infra/media/media-version-repository.adapter";
import { makeServerCredentials } from "@canto/core/infra/media-servers/server-credentials.adapter";
import { makeUserConnectionRepository } from "@canto/core/infra/media-servers/user-connection-repository.adapter";

/**
 * Composition-root binding for `MediaServerPushPort`. Constructs the
 * underlying repositories + adapters from the supplied `Database` handle and
 * dispatches each push call to the corresponding use case.
 */
export function makeMediaServerPush(db: Database): MediaServerPushPort {
  const baseDeps: PushWatchStateDeps & PushPlaybackPositionDeps = {
    media: makeMediaRepository(db),
    mediaVersions: makeMediaVersionRepository(db),
    localization: makeMediaLocalizationRepository(db),
    userConnections: makeUserConnectionRepository(db),
    credentials: makeServerCredentials(),
    jellyfinServer: jellyfinMediaServer,
    plexServer: plexMediaServer,
  };

  return {
    pushWatchState: (userId, mediaId, watched) =>
      pushWatchStateToServers(baseDeps, userId, mediaId, watched),
    pushPlaybackPosition: (
      userId,
      mediaId,
      episodeId,
      positionSeconds,
      isCompleted,
      excludeSource,
    ) =>
      pushPlaybackPositionToServers(
        baseDeps,
        userId,
        mediaId,
        episodeId,
        positionSeconds,
        isCompleted,
        excludeSource,
      ),
  };
}
