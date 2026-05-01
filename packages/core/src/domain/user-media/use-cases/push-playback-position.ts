/* -------------------------------------------------------------------------- */
/*  Use-case: push playback position from one media server to the others      */
/*                                                                            */
/*  Reverse-sync pulls resume position from Jellyfin/Plex into                */
/*  user_playback_progress. Canto itself has no player, but users who run     */
/*  both servers expect to resume playback from either one. This flow fans    */
/*  the freshly-observed position OUT to every OTHER enabled server for that  */
/*  user so the two libraries stay in lock-step.                              */
/*                                                                            */
/*  Echo prevention lives at two layers:                                      */
/*    1. `excludeSource` never pushes back to the server we just read from.   */
/*    2. The reverse-sync caller skips invoking this use-case at all when the */
/*       new position is within a few seconds of the previously-stored value  */
/*       AND the completion flag hasn't flipped, so a round-trip observation  */
/*       does NOT retrigger a push on the next sync cycle.                    */
/* -------------------------------------------------------------------------- */

import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { MediaVersionRepositoryPort } from "@canto/core/domain/media-servers/ports/media-version-repository.port";
import type { ServerCredentialsPort } from "@canto/core/domain/media-servers/ports/server-credentials.port";
import type { UserConnectionRepositoryPort } from "@canto/core/domain/media-servers/ports/user-connection-repository.port";
import type {
  MediaVersionEpisodeRow,
  MediaVersionRow,
} from "@canto/core/domain/media-servers/types/media-version";
import type { UserConnection } from "@canto/core/domain/media-servers/types/user-connection";
import type { MediaServerPort } from "@canto/core/domain/shared/ports/media-server.port";
import type { ServerSource } from "@canto/core/domain/sync/types";

type VersionWithEpisodes = MediaVersionRow & { episodes: MediaVersionEpisodeRow[] };

export interface PushPlaybackPositionDeps {
  media: MediaRepositoryPort;
  mediaVersions: MediaVersionRepositoryPort;
  userConnections: UserConnectionRepositoryPort;
  credentials: ServerCredentialsPort;
  jellyfinServer: MediaServerPort;
  plexServer: MediaServerPort;
}

function logError(scope: string, userId: string, err: unknown): void {
  console.error(
    `[push-playback-position] ${scope} failed for user ${userId}:`,
    err instanceof Error ? err.message : err,
  );
}

function resolveServerItemId(
  versions: VersionWithEpisodes[],
  source: ServerSource,
  episodeNumbers: { seasonNumber: number; episodeNumber: number } | null,
): string | null {
  const sourceVersions = versions.filter((v) => v.source === source);
  if (sourceVersions.length === 0) return null;

  if (!episodeNumbers) {
    return sourceVersions[0]?.serverItemId ?? null;
  }

  for (const version of sourceVersions) {
    const match = version.episodes.find(
      (ep) =>
        ep.seasonNumber === episodeNumbers.seasonNumber &&
        ep.episodeNumber === episodeNumbers.episodeNumber &&
        ep.serverEpisodeId,
    );
    if (match?.serverEpisodeId) return match.serverEpisodeId;
  }
  return null;
}

async function pushOne(
  source: ServerSource,
  port: MediaServerPort,
  url: string,
  conn: UserConnection,
  versions: VersionWithEpisodes[],
  episodeNumbers: { seasonNumber: number; episodeNumber: number } | null,
  positionSeconds: number,
  isCompleted: boolean,
  mediaId: string,
): Promise<void> {
  if (!conn.token) return;
  if (source === "jellyfin" && !conn.externalUserId) {
    console.warn(
      `[push-playback-position] Jellyfin connection ${conn.id} missing externalUserId, skipping`,
    );
    return;
  }
  const itemId = resolveServerItemId(versions, source, episodeNumbers);
  if (!itemId) {
    console.warn(
      `[push-playback-position] No ${source} item resolved for media ${mediaId}${
        episodeNumbers
          ? ` S${episodeNumbers.seasonNumber}E${episodeNumbers.episodeNumber}`
          : ""
      } on connection ${conn.id}`,
    );
    return;
  }
  await port.setPlaybackPosition(url, conn.token, {
    itemId,
    externalUserId: conn.externalUserId,
    positionSeconds,
    isCompleted,
  });
}

export async function pushPlaybackPositionToServers(
  deps: PushPlaybackPositionDeps,
  userId: string,
  mediaId: string,
  episodeId: string | null | undefined,
  positionSeconds: number,
  isCompleted: boolean,
  excludeSource: ServerSource | null,
): Promise<void> {
  const mediaRow = await deps.media.findById(mediaId);
  if (!mediaRow) return;

  const connections = await deps.userConnections.findByUserId(userId);
  const enabled = connections.filter((c) => c.enabled && c.token);
  if (enabled.length === 0) return;

  let episodeNumbers: { seasonNumber: number; episodeNumber: number } | null = null;
  if (episodeId) {
    episodeNumbers = await deps.media.findEpisodeNumbersById(episodeId);
    if (!episodeNumbers) {
      console.warn(
        `[push-playback-position] Could not resolve episode numbers for ${episodeId}`,
      );
      return;
    }
  }

  const versions = await deps.mediaVersions.findWithEpisodesByMediaId(mediaId);

  const jellyfinConns = enabled.filter(
    (c) => c.provider === "jellyfin" && excludeSource !== "jellyfin",
  );
  const plexConns = enabled.filter(
    (c) => c.provider === "plex" && excludeSource !== "plex",
  );

  const jellyfinCreds = jellyfinConns.length > 0 ? await deps.credentials.getJellyfin() : null;
  const plexCreds = plexConns.length > 0 ? await deps.credentials.getPlex() : null;

  await Promise.all([
    ...(jellyfinCreds
      ? jellyfinConns.map((conn) =>
          pushOne(
            "jellyfin",
            deps.jellyfinServer,
            jellyfinCreds.url,
            conn,
            versions,
            episodeNumbers,
            positionSeconds,
            isCompleted,
            mediaId,
          ).catch((err) => logError(`jellyfin ${conn.id}`, userId, err)),
        )
      : []),
    ...(plexCreds
      ? plexConns.map((conn) =>
          pushOne(
            "plex",
            deps.plexServer,
            plexCreds.url,
            conn,
            versions,
            episodeNumbers,
            positionSeconds,
            isCompleted,
            mediaId,
          ).catch((err) => logError(`plex ${conn.id}`, userId, err)),
        )
      : []),
  ]);
}
