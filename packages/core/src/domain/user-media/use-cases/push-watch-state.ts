/* -------------------------------------------------------------------------- */
/*  Use-case: push watch state from Canto → media servers                     */
/*                                                                            */
/*  Reverse-sync is read-only (server → Canto). This flow handles the write   */
/*  direction: when a user marks a media item watched/unwatched in the Canto  */
/*  UI, we fire-and-forget a per-server push to mirror the state on their     */
/*  enabled Jellyfin / Plex connections. Errors are logged and swallowed per  */
/*  server so one bad server never blocks the others or the caller.          */
/* -------------------------------------------------------------------------- */

import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { MediaVersionRepositoryPort } from "@canto/core/domain/media-servers/ports/media-version-repository.port";
import type { ServerCredentialsPort } from "@canto/core/domain/media-servers/ports/server-credentials.port";
import type { UserConnectionRepositoryPort } from "@canto/core/domain/media-servers/ports/user-connection-repository.port";
import type { UserConnection } from "@canto/core/domain/media-servers/types/user-connection";
import type { MediaServerPort } from "@canto/core/domain/shared/ports/media-server.port";

export interface PushWatchStateDeps {
  media: MediaRepositoryPort;
  mediaVersions: MediaVersionRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  userConnections: UserConnectionRepositoryPort;
  credentials: ServerCredentialsPort;
  jellyfinServer: MediaServerPort;
  plexServer: MediaServerPort;
}

interface MediaWithTitle {
  title: string;
  provider: string;
  externalId: number;
  type: string;
}

function logError(scope: string, userId: string, err: unknown): void {
  console.error(
    `[push-watch-state] ${scope} failed for user ${userId}:`,
    err instanceof Error ? err.message : err,
  );
}

export async function pushWatchStateToServers(
  deps: PushWatchStateDeps,
  userId: string,
  mediaId: string,
  watched: boolean,
): Promise<void> {
  const mediaRow = await deps.media.findById(mediaId);
  if (!mediaRow) return;

  const enLoc = await deps.localization.findOne(mediaRow.id, "en-US");
  const mediaWithTitle: MediaWithTitle = {
    title: enLoc?.title ?? "",
    provider: mediaRow.provider,
    externalId: mediaRow.externalId,
    type: mediaRow.type,
  };

  const connections = await deps.userConnections.findByUserId(userId);
  const enabled = connections.filter((c) => c.enabled && c.token);
  if (enabled.length === 0) return;

  const jellyfinConns = enabled.filter((c) => c.provider === "jellyfin");
  const plexConns = enabled.filter((c) => c.provider === "plex");

  const jellyfinCreds = jellyfinConns.length > 0 ? await deps.credentials.getJellyfin() : null;
  const plexCreds = plexConns.length > 0 ? await deps.credentials.getPlex() : null;

  await Promise.all([
    ...(jellyfinCreds
      ? jellyfinConns.map((conn) =>
          pushJellyfin(deps, jellyfinCreds, conn, mediaId, mediaWithTitle, watched).catch(
            (err) => logError(`jellyfin ${conn.id}`, userId, err),
          ),
        )
      : []),
    ...(plexCreds
      ? plexConns.map((conn) =>
          pushPlex(deps, plexCreds, conn, mediaId, mediaWithTitle, watched).catch((err) =>
            logError(`plex ${conn.id}`, userId, err),
          ),
        )
      : []),
  ]);
}

async function pushJellyfin(
  deps: PushWatchStateDeps,
  creds: { url: string; apiKey: string },
  conn: UserConnection,
  mediaId: string,
  mediaRow: MediaWithTitle,
  watched: boolean,
): Promise<void> {
  if (!conn.token) return;
  if (!conn.externalUserId) {
    console.warn(
      `[push-watch-state] Jellyfin connection ${conn.id} missing externalUserId, skipping`,
    );
    return;
  }
  if (mediaRow.provider !== "tmdb" && mediaRow.provider !== "tvdb") {
    return;
  }

  let itemId = await resolveJellyfinItemIdFromVersions(deps, mediaId);
  itemId ??= await deps.jellyfinServer.findItemIdByProvider(
    creds.url,
    conn.token,
    {
      title: mediaRow.title,
      externalId: mediaRow.externalId,
      provider: mediaRow.provider,
      type: mediaRow.type === "show" ? "show" : "movie",
      externalUserId: conn.externalUserId,
    },
  );
  if (!itemId) {
    console.warn(
      `[push-watch-state] No Jellyfin item found for media ${mediaId} (tmdb ${mediaRow.externalId}) on connection ${conn.id}`,
    );
    return;
  }

  if (watched) {
    await deps.jellyfinServer.markPlayed(creds.url, conn.token, {
      itemId,
      externalUserId: conn.externalUserId,
    });
  } else {
    await deps.jellyfinServer.markUnplayed(creds.url, conn.token, {
      itemId,
      externalUserId: conn.externalUserId,
    });
  }
}

async function resolveJellyfinItemIdFromVersions(
  deps: PushWatchStateDeps,
  mediaId: string,
): Promise<string | null> {
  const versions = await deps.mediaVersions.findByMediaId(mediaId);
  const jellyfinVersion = versions.find((v) => v.source === "jellyfin");
  return jellyfinVersion?.serverItemId ?? null;
}

async function pushPlex(
  deps: PushWatchStateDeps,
  creds: { url: string; token: string },
  conn: UserConnection,
  mediaId: string,
  mediaRow: MediaWithTitle,
  watched: boolean,
): Promise<void> {
  if (!conn.token) return;

  const versions = await deps.mediaVersions.findByMediaId(mediaId);
  const plexVersion = versions.find((v) => v.source === "plex");
  let ratingKey: string | null = plexVersion?.serverItemId ?? null;

  // Fallback: resolve against the live Plex API by provider id when reverse
  // sync hasn't observed the media yet (fresh link or new item).
  if (
    !ratingKey &&
    (mediaRow.provider === "tmdb" || mediaRow.provider === "tvdb")
  ) {
    ratingKey = await deps.plexServer.findItemIdByProvider(creds.url, conn.token, {
      title: mediaRow.title,
      externalId: mediaRow.externalId,
      provider: mediaRow.provider,
      type: mediaRow.type === "show" ? "show" : "movie",
    });
  }

  if (!ratingKey) {
    console.warn(
      `[push-watch-state] No Plex item found for media ${mediaId} (${mediaRow.provider} ${mediaRow.externalId}) on connection ${conn.id}`,
    );
    return;
  }

  if (watched) {
    await deps.plexServer.markPlayed(creds.url, conn.token, { itemId: ratingKey });
  } else {
    await deps.plexServer.markUnplayed(creds.url, conn.token, { itemId: ratingKey });
  }
}
