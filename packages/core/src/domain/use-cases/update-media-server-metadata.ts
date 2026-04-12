/* -------------------------------------------------------------------------- */
/*  Use-case: Push updated provider IDs to connected media servers            */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import { getSettings } from "@canto/db/settings";
import { findMediaById } from "../../infrastructure/repositories/media-repository";
import {
  findMediaVersionsByMediaId,
  updateMediaVersion,
} from "../../infrastructure/repositories/media-version-repository";
import {
  applyJellyfinRemoteMatch,
  getJellyfinItem,
} from "../../infrastructure/adapters/jellyfin";
import {
  matchPlexItem,
  lockPlexFields,
  getPlexItem,
} from "../../infrastructure/adapters/plex";

export interface ServerUpdateResult {
  jellyfin: boolean;
  plex: boolean;
  /** Updated server title after refresh (confirmation that fix propagated). */
  updatedServerTitle?: string;
}

export async function updateMediaServerMetadata(
  db: Database,
  mediaId: string,
): Promise<ServerUpdateResult> {
  const result: ServerUpdateResult = { jellyfin: false, plex: false };

  const mediaRow = await findMediaById(db, mediaId);
  if (!mediaRow) return result;

  const versions = await findMediaVersionsByMediaId(db, mediaId);
  if (versions.length === 0) return result;

  const {
    "jellyfin.enabled": jellyfinEnabled,
    "jellyfin.url": jellyfinUrl,
    "jellyfin.apiKey": jellyfinKey,
    "plex.enabled": plexEnabled,
    "plex.url": plexUrl,
    "plex.token": plexToken,
  } = await getSettings([
    "jellyfin.enabled",
    "jellyfin.url",
    "jellyfin.apiKey",
    "plex.enabled",
    "plex.url",
    "plex.token",
  ]);

  // The media row's `type` drives which Jellyfin/Plex endpoints we call.
  const mediaType = mediaRow.type === "show" ? "show" : "movie";
  const plexType: 1 | 2 = mediaType === "movie" ? 1 : 2;

  for (const version of versions) {
    // ── Jellyfin ──────────────────────────────────────────────────────────
    // `applyJellyfinRemoteMatch` runs RemoteSearch → RemoteSearch/Apply,
    // which is what the Jellyfin web UI does when a user picks a match in
    // the "Identify…" dialog. No more patch-POST or ReplaceAllMetadata
    // refresh (which used to actively undo the fix).
    if (version.source === "jellyfin" && jellyfinEnabled && jellyfinUrl && jellyfinKey) {
      try {
        await applyJellyfinRemoteMatch(
          jellyfinUrl,
          jellyfinKey,
          version.serverItemId,
          mediaType,
          mediaRow.externalId,
        );

        const updated = await getJellyfinItem(
          jellyfinUrl,
          jellyfinKey,
          version.serverItemId,
        );
        if (updated) {
          await updateMediaVersion(db, version.id, {
            serverItemTitle: updated.name,
            serverItemYear: updated.year ?? null,
          });
          result.updatedServerTitle = updated.name;
        }

        result.jellyfin = true;
      } catch (err) {
        console.warn(
          `[update-metadata] Jellyfin match update failed for item ${version.serverItemId}:`,
          err instanceof Error ? err.message : err,
        );
      }
      continue;
    }

    // ── Plex ──────────────────────────────────────────────────────────────
    // `matchPlexItem` hits `/library/metadata/:id/match` with the legacy
    // themoviedb guid (`com.plexapp.agents.themoviedb://<id>?lang=en`),
    // which modern Plex still accepts across both legacy and the new
    // tv.plex.agents.movie/show agents. Then we lock the core fields so a
    // future library scan can't stomp the correction.
    if (version.source === "plex" && plexEnabled && plexUrl && plexToken) {
      try {
        await matchPlexItem(
          plexUrl,
          plexToken,
          version.serverItemId,
          mediaRow.externalId,
          { name: mediaRow.title },
        );
        await lockPlexFields(plexUrl, plexToken, version.serverItemId, plexType);

        const updated = await getPlexItem(plexUrl, plexToken, version.serverItemId);
        if (updated) {
          await updateMediaVersion(db, version.id, {
            serverItemTitle: updated.title,
            serverItemYear: updated.year ?? null,
          });
          result.updatedServerTitle = updated.title;
        }

        result.plex = true;
      } catch (err) {
        console.warn(
          `[update-metadata] Plex match update failed for item ${version.serverItemId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return result;
}
