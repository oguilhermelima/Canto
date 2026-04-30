/* -------------------------------------------------------------------------- */
/*  Use-case: Push updated provider IDs to connected media servers            */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import { getSettings } from "@canto/db/settings";
import type { JellyfinAdapterPort } from "@canto/core/domain/media-servers/ports/jellyfin-adapter.port";
import type { PlexAdapterPort } from "@canto/core/domain/media-servers/ports/plex-adapter.port";
import { findMediaById } from "@canto/core/infra/media/media-repository";
import { findMediaLocalized } from "@canto/core/infra/media/media-localized-repository";
import {
  findMediaVersionsByMediaId,
  updateMediaVersion,
} from "@canto/core/infra/media/media-version-repository";

export interface ServerUpdateResult {
  jellyfin: boolean;
  plex: boolean;
  /** Updated server title after refresh (confirmation that fix propagated). */
  updatedServerTitle?: string;
}

export interface UpdateMediaServerMetadataDeps {
  plex: PlexAdapterPort;
  jellyfin: JellyfinAdapterPort;
}

export async function updateMediaServerMetadata(
  db: Database,
  mediaId: string,
  deps: UpdateMediaServerMetadataDeps,
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
    // `applyRemoteMatch` runs RemoteSearch → RemoteSearch/Apply, which is
    // what the Jellyfin web UI does when a user picks a match in the
    // "Identify…" dialog. No more patch-POST or ReplaceAllMetadata refresh
    // (which used to actively undo the fix).
    if (version.source === "jellyfin" && jellyfinEnabled && jellyfinUrl && jellyfinKey) {
      try {
        await deps.jellyfin.applyRemoteMatch(
          jellyfinUrl,
          jellyfinKey,
          version.serverItemId,
          mediaType,
          mediaRow.externalId,
        );

        const updated = await deps.jellyfin.getItem(
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
    // `matchItem` hits `/library/metadata/:id/match` with the legacy
    // themoviedb guid (`com.plexapp.agents.themoviedb://<id>?lang=en`),
    // which modern Plex still accepts across both legacy and the new
    // tv.plex.agents.movie/show agents. Then we lock the core fields so a
    // future library scan can't stomp the correction.
    if (version.source === "plex" && plexEnabled && plexUrl && plexToken) {
      try {
        // Plex match-by-name uses the canonical en-US title.
        const enLoc = await findMediaLocalized(db, mediaRow.id, "en-US");
        await deps.plex.matchItem(
          plexUrl,
          plexToken,
          version.serverItemId,
          mediaRow.externalId,
          { name: enLoc?.title ?? "" },
        );
        await deps.plex.lockFields(plexUrl, plexToken, version.serverItemId, plexType);

        const updated = await deps.plex.getItem(plexUrl, plexToken, version.serverItemId);
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
