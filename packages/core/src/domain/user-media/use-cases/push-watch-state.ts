/* -------------------------------------------------------------------------- */
/*  Use-case: push watch state from Canto → media servers                     */
/*                                                                            */
/*  Reverse-sync is read-only (server → Canto). This flow handles the write   */
/*  direction: when a user marks a media item watched/unwatched in the Canto  */
/*  UI, we fire-and-forget a per-server push to mirror the state on their     */
/*  enabled Jellyfin / Plex connections. Errors are logged and swallowed per  */
/*  server so one bad server never blocks the others or the caller.          */
/* -------------------------------------------------------------------------- */

import { getSetting } from "@canto/db/settings";
import type { Database } from "@canto/db/client";
import { findMediaById } from "@canto/core/infra/media/media-repository";
import { findMediaVersionsByMediaId } from "@canto/core/infra/media/media-version-repository";
import { findUserConnectionsByUserId } from "@canto/core/infra/media-servers/user-connection-repository";
import { findMediaLocalized } from "@canto/core/infra/media/media-localized-repository";
import {
  findJellyfinItemIdByProviderForUser,
  markJellyfinItemPlayed,
  markJellyfinItemUnplayed,
} from "@canto/core/infra/media-servers/jellyfin.adapter";
import {
  findPlexItemIdByProviderId,
  markPlexItemUnwatched,
  markPlexItemWatched,
} from "@canto/core/infra/media-servers/plex.adapter";

function logError(scope: string, userId: string, err: unknown): void {
  console.error(
    `[push-watch-state] ${scope} failed for user ${userId}:`,
    err instanceof Error ? err.message : err,
  );
}

export async function pushWatchStateToServers(
  db: Database,
  userId: string,
  mediaId: string,
  watched: boolean,
): Promise<void> {
  const mediaRow = await findMediaById(db, mediaId);
  if (!mediaRow) return;

  // Title for the Jellyfin/Plex search fallback comes from en-US localization.
  const enLoc = await findMediaLocalized(db, mediaRow.id, "en-US");
  const mediaWithTitle = {
    title: enLoc?.title ?? "",
    provider: mediaRow.provider,
    externalId: mediaRow.externalId,
    type: mediaRow.type,
  };

  const connections = await findUserConnectionsByUserId(db, userId);
  const enabled = connections.filter((c) => c.enabled && c.token);
  if (enabled.length === 0) return;

  const jellyfinConns = enabled.filter((c) => c.provider === "jellyfin");
  const plexConns = enabled.filter((c) => c.provider === "plex");

  await Promise.all([
    ...jellyfinConns.map((conn) =>
      pushJellyfin(db, mediaId, mediaWithTitle, conn, watched).catch((err) =>
        logError(`jellyfin ${conn.id}`, userId, err),
      ),
    ),
    ...plexConns.map((conn) =>
      pushPlex(db, mediaId, mediaWithTitle, conn, watched).catch((err) =>
        logError(`plex ${conn.id}`, userId, err),
      ),
    ),
  ]);
}

/* -------------------------------------------------------------------------- */
/*  Jellyfin                                                                   */
/* -------------------------------------------------------------------------- */

async function pushJellyfin(
  db: Database,
  mediaId: string,
  mediaRow: { title: string; provider: string; externalId: number },
  conn: {
    id: string;
    userId: string;
    token: string | null;
    externalUserId: string | null;
  },
  watched: boolean,
): Promise<void> {
  if (!conn.token) return;
  if (!conn.externalUserId) {
    console.warn(
      `[push-watch-state] Jellyfin connection ${conn.id} missing externalUserId, skipping`,
    );
    return;
  }
  const jellyfinUrl = await getSetting("jellyfin.url");
  if (!jellyfinUrl) return;
  if (mediaRow.provider !== "tmdb" && mediaRow.provider !== "tvdb") {
    // We can only resolve items on the server when the Canto media row has
    // a tmdb or tvdb id — those are the provider keys Jellyfin exposes.
    return;
  }

  let itemId = await resolveJellyfinItemIdFromVersions(db, mediaId);
  if (!itemId) {
    itemId = await findJellyfinItemIdByProviderForUser(
      jellyfinUrl,
      conn.token,
      conn.externalUserId,
      mediaRow.title,
      mediaRow.externalId,
      mediaRow.provider,
    );
  }
  if (!itemId) {
    console.warn(
      `[push-watch-state] No Jellyfin item found for media ${mediaId} (tmdb ${mediaRow.externalId}) on connection ${conn.id}`,
    );
    return;
  }

  if (watched) {
    await markJellyfinItemPlayed(jellyfinUrl, conn.token, conn.externalUserId, itemId);
  } else {
    await markJellyfinItemUnplayed(jellyfinUrl, conn.token, conn.externalUserId, itemId);
  }
}

async function resolveJellyfinItemIdFromVersions(
  db: Database,
  mediaId: string,
): Promise<string | null> {
  const versions = await findMediaVersionsByMediaId(db, mediaId);
  const jellyfinVersion = versions.find((v) => v.source === "jellyfin");
  return jellyfinVersion?.serverItemId ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Plex                                                                       */
/* -------------------------------------------------------------------------- */

async function pushPlex(
  db: Database,
  mediaId: string,
  mediaRow: { title: string; provider: string; externalId: number; type: string },
  conn: { id: string; token: string | null },
  watched: boolean,
): Promise<void> {
  if (!conn.token) return;
  const plexUrl = await getSetting("plex.url");
  if (!plexUrl) return;

  // Prefer the serverItemId already persisted by reverse-sync.
  const versions = await findMediaVersionsByMediaId(db, mediaId);
  const plexVersion = versions.find((v) => v.source === "plex");
  let ratingKey: string | null = plexVersion?.serverItemId ?? null;

  // Fallback: resolve against the live Plex API by provider id. Handles the
  // case where the user just linked Plex (or added the item) and the next
  // reverse-sync pass hasn't populated media_version yet.
  if (
    !ratingKey &&
    (mediaRow.provider === "tmdb" || mediaRow.provider === "tvdb")
  ) {
    const plexType = mediaRow.type === "show" ? "show" : "movie";
    ratingKey = await findPlexItemIdByProviderId(
      plexUrl,
      conn.token,
      mediaRow.title,
      mediaRow.externalId,
      mediaRow.provider,
      plexType,
    );
  }

  if (!ratingKey) {
    console.warn(
      `[push-watch-state] No Plex item found for media ${mediaId} (${mediaRow.provider} ${mediaRow.externalId}) on connection ${conn.id}`,
    );
    return;
  }

  if (watched) {
    await markPlexItemWatched(plexUrl, conn.token, ratingKey);
  } else {
    await markPlexItemUnwatched(plexUrl, conn.token, ratingKey);
  }
}
