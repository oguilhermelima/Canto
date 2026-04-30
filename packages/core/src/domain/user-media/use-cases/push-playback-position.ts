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

import { getSetting } from "@canto/db/settings";
import type { Database } from "@canto/db/client";
import {
  findEpisodeNumbersById,
  findMediaById,
  findMediaVersionsWithEpisodes,
  findUserConnectionsByUserId,
} from "@canto/core/infra/repositories";
import { setJellyfinPlaybackPosition } from "@canto/core/infra/media-servers/jellyfin.adapter";
import { setPlexPlaybackPosition } from "@canto/core/infra/media-servers/plex.adapter";
import type { ServerSource } from "@canto/core/domain/sync/types";

type Conn = Awaited<ReturnType<typeof findUserConnectionsByUserId>>[number];
type VersionWithEpisodes = Awaited<
  ReturnType<typeof findMediaVersionsWithEpisodes>
>[number];

function logError(scope: string, userId: string, err: unknown): void {
  console.error(
    `[push-playback-position] ${scope} failed for user ${userId}:`,
    err instanceof Error ? err.message : err,
  );
}

export async function pushPlaybackPositionToServers(
  db: Database,
  userId: string,
  mediaId: string,
  episodeId: string | null | undefined,
  positionSeconds: number,
  isCompleted: boolean,
  excludeSource: ServerSource | null,
): Promise<void> {
  const mediaRow = await findMediaById(db, mediaId);
  if (!mediaRow) return;

  const connections = await findUserConnectionsByUserId(db, userId);
  const enabled = connections.filter((c) => c.enabled && c.token);
  if (enabled.length === 0) return;

  let episodeNumbers: { seasonNumber: number; episodeNumber: number } | null =
    null;
  if (episodeId) {
    episodeNumbers = await findEpisodeNumbersById(db, episodeId);
    if (!episodeNumbers) {
      console.warn(
        `[push-playback-position] Could not resolve episode numbers for ${episodeId}`,
      );
      return;
    }
  }

  const versions = await findMediaVersionsWithEpisodes(db, mediaId);

  const jellyfinConns = enabled.filter(
    (c) => c.provider === "jellyfin" && excludeSource !== "jellyfin",
  );
  const plexConns = enabled.filter(
    (c) => c.provider === "plex" && excludeSource !== "plex",
  );

  await Promise.all([
    ...jellyfinConns.map((conn) =>
      pushJellyfin(
        mediaId,
        versions,
        episodeNumbers,
        conn,
        positionSeconds,
        isCompleted,
      ).catch((err) => logError(`jellyfin ${conn.id}`, userId, err)),
    ),
    ...plexConns.map((conn) =>
      pushPlex(
        mediaId,
        versions,
        episodeNumbers,
        conn,
        positionSeconds,
        isCompleted,
      ).catch((err) => logError(`plex ${conn.id}`, userId, err)),
    ),
  ]);
}

/* -------------------------------------------------------------------------- */
/*  Resolvers                                                                  */
/* -------------------------------------------------------------------------- */

function resolveServerItemId(
  versions: VersionWithEpisodes[],
  source: ServerSource,
  episodeNumbers: { seasonNumber: number; episodeNumber: number } | null,
): string | null {
  const sourceVersions = versions.filter((v) => v.source === source);
  if (sourceVersions.length === 0) return null;

  if (!episodeNumbers) {
    // Movie: media_version.serverItemId is the item itself.
    return sourceVersions[0]?.serverItemId ?? null;
  }

  // Show: look for the specific episode under any version on this source.
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

/* -------------------------------------------------------------------------- */
/*  Jellyfin                                                                   */
/* -------------------------------------------------------------------------- */

async function pushJellyfin(
  mediaId: string,
  versions: VersionWithEpisodes[],
  episodeNumbers: { seasonNumber: number; episodeNumber: number } | null,
  conn: Conn,
  positionSeconds: number,
  isCompleted: boolean,
): Promise<void> {
  if (!conn.token) return;
  if (!conn.externalUserId) {
    console.warn(
      `[push-playback-position] Jellyfin connection ${conn.id} missing externalUserId, skipping`,
    );
    return;
  }
  const jellyfinUrl = await getSetting("jellyfin.url");
  if (!jellyfinUrl) return;

  const itemId = resolveServerItemId(versions, "jellyfin", episodeNumbers);
  if (!itemId) {
    console.warn(
      `[push-playback-position] No Jellyfin item resolved for media ${mediaId}${
        episodeNumbers
          ? ` S${episodeNumbers.seasonNumber}E${episodeNumbers.episodeNumber}`
          : ""
      } on connection ${conn.id}`,
    );
    return;
  }

  await setJellyfinPlaybackPosition(
    jellyfinUrl,
    conn.token,
    conn.externalUserId,
    itemId,
    positionSeconds,
    isCompleted,
  );
}

/* -------------------------------------------------------------------------- */
/*  Plex                                                                       */
/* -------------------------------------------------------------------------- */

async function pushPlex(
  mediaId: string,
  versions: VersionWithEpisodes[],
  episodeNumbers: { seasonNumber: number; episodeNumber: number } | null,
  conn: Conn,
  positionSeconds: number,
  isCompleted: boolean,
): Promise<void> {
  if (!conn.token) return;
  const plexUrl = await getSetting("plex.url");
  if (!plexUrl) return;

  const ratingKey = resolveServerItemId(versions, "plex", episodeNumbers);
  if (!ratingKey) {
    console.warn(
      `[push-playback-position] No Plex ratingKey resolved for media ${mediaId}${
        episodeNumbers
          ? ` S${episodeNumbers.seasonNumber}E${episodeNumbers.episodeNumber}`
          : ""
      } on connection ${conn.id}`,
    );
    return;
  }

  await setPlexPlaybackPosition(
    plexUrl,
    conn.token,
    ratingKey,
    positionSeconds,
    isCompleted,
  );
}
