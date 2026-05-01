/* -------------------------------------------------------------------------- */
/*  Use-case: Push updated provider IDs to connected media servers            */
/* -------------------------------------------------------------------------- */

import { getSettings } from "@canto/db/settings";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { JellyfinAdapterPort } from "@canto/core/domain/media-servers/ports/jellyfin-adapter.port";
import type { MediaVersionRepositoryPort } from "@canto/core/domain/media-servers/ports/media-version-repository.port";
import type { PlexAdapterPort } from "@canto/core/domain/media-servers/ports/plex-adapter.port";
import type { ServerCredentialsPort } from "@canto/core/domain/media-servers/ports/server-credentials.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";

export interface ServerUpdateResult {
  jellyfin: boolean;
  plex: boolean;
  /** Updated server title after refresh (confirmation that fix propagated). */
  updatedServerTitle?: string;
}

export interface UpdateMediaServerMetadataDeps {
  media: MediaRepositoryPort;
  mediaVersions: MediaVersionRepositoryPort;
  localization: MediaLocalizationRepositoryPort;
  credentials: ServerCredentialsPort;
  plex: PlexAdapterPort;
  jellyfin: JellyfinAdapterPort;
  logger?: LoggerPort;
}

export async function updateMediaServerMetadata(
  mediaId: string,
  deps: UpdateMediaServerMetadataDeps,
): Promise<ServerUpdateResult> {
  const result: ServerUpdateResult = { jellyfin: false, plex: false };

  const mediaRow = await deps.media.findById(mediaId);
  if (!mediaRow) return result;

  const versions = await deps.mediaVersions.findByMediaId(mediaId);
  if (versions.length === 0) return result;

  const {
    "jellyfin.enabled": jellyfinEnabled,
    "plex.enabled": plexEnabled,
  } = await getSettings(["jellyfin.enabled", "plex.enabled"]);

  const jellyfinCreds = jellyfinEnabled
    ? await deps.credentials.getJellyfin()
    : null;
  const plexCreds = plexEnabled ? await deps.credentials.getPlex() : null;

  // The media row's `type` drives which Jellyfin/Plex endpoints we call.
  const mediaType = mediaRow.type === "show" ? "show" : "movie";
  const plexType: 1 | 2 = mediaType === "movie" ? 1 : 2;

  for (const version of versions) {
    if (version.source === "jellyfin" && jellyfinCreds) {
      try {
        await deps.jellyfin.applyRemoteMatch(
          jellyfinCreds.url,
          jellyfinCreds.apiKey,
          version.serverItemId,
          mediaType,
          mediaRow.externalId,
        );

        const updated = await deps.jellyfin.getItem(
          jellyfinCreds.url,
          jellyfinCreds.apiKey,
          version.serverItemId,
        );
        if (updated) {
          await deps.mediaVersions.update(version.id, {
            serverItemTitle: updated.name,
            serverItemYear: updated.year ?? null,
          });
          result.updatedServerTitle = updated.name;
        }

        result.jellyfin = true;
      } catch (err) {
        deps.logger?.warn(
          `[update-metadata] Jellyfin match update failed for item ${version.serverItemId}`,
          { err: err instanceof Error ? err.message : err },
        );
      }
      continue;
    }

    if (version.source === "plex" && plexCreds) {
      try {
        // Plex match-by-name uses the canonical en-US title.
        const enLoc = await deps.localization.findOne(mediaRow.id, "en-US");
        await deps.plex.matchItem(
          plexCreds.url,
          plexCreds.token,
          version.serverItemId,
          mediaRow.externalId,
          { name: enLoc?.title ?? "" },
        );
        await deps.plex.lockFields(
          plexCreds.url,
          plexCreds.token,
          version.serverItemId,
          plexType,
        );

        const updated = await deps.plex.getItem(
          plexCreds.url,
          plexCreds.token,
          version.serverItemId,
        );
        if (updated) {
          await deps.mediaVersions.update(version.id, {
            serverItemTitle: updated.title,
            serverItemYear: updated.year ?? null,
          });
          result.updatedServerTitle = updated.title;
        }

        result.plex = true;
      } catch (err) {
        deps.logger?.warn(
          `[update-metadata] Plex match update failed for item ${version.serverItemId}`,
          { err: err instanceof Error ? err.message : err },
        );
      }
    }
  }

  return result;
}
