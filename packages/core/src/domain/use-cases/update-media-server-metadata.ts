/* -------------------------------------------------------------------------- */
/*  Use-case: Push updated provider IDs to connected media servers            */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import { findMediaById } from "../../infrastructure/repositories/media-repository";
import { findSyncItemsByMediaId, updateSyncItem } from "../../infrastructure/repositories/sync-repository";
import {
  updateJellyfinProviderIds,
  refreshJellyfinItem,
  getJellyfinItem,
} from "../../infrastructure/adapters/jellyfin";
import { refreshPlexItem, getPlexItem } from "../../infrastructure/adapters/plex";

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

  const syncItems = await findSyncItemsByMediaId(db, mediaId);
  if (syncItems.length === 0) return result;

  const jellyfinEnabled = await getSetting<boolean>(SETTINGS.JELLYFIN_ENABLED);
  const jellyfinUrl = await getSetting<string>(SETTINGS.JELLYFIN_URL);
  const jellyfinKey = await getSetting<string>(SETTINGS.JELLYFIN_API_KEY);

  const plexEnabled = await getSetting<boolean>(SETTINGS.PLEX_ENABLED);
  const plexUrl = await getSetting<string>(SETTINGS.PLEX_URL);
  const plexToken = await getSetting<string>(SETTINGS.PLEX_TOKEN);

  for (const item of syncItems) {
    // Jellyfin items
    if (
      item.source === "jellyfin" &&
      item.jellyfinItemId &&
      jellyfinEnabled &&
      jellyfinUrl &&
      jellyfinKey
    ) {
      try {
        const providerIds: Record<string, string> = {
          Tmdb: String(mediaRow.externalId),
        };
        if (mediaRow.tvdbId) providerIds.Tvdb = String(mediaRow.tvdbId);
        if (mediaRow.imdbId) providerIds.Imdb = mediaRow.imdbId;

        await updateJellyfinProviderIds(
          jellyfinUrl as string,
          jellyfinKey as string,
          item.jellyfinItemId,
          providerIds,
        );
        await refreshJellyfinItem(
          jellyfinUrl as string,
          jellyfinKey as string,
          item.jellyfinItemId,
        );

        // Re-fetch item to confirm the update and sync the title back
        const updated = await getJellyfinItem(
          jellyfinUrl as string,
          jellyfinKey as string,
          item.jellyfinItemId,
        );
        if (updated) {
          await updateSyncItem(db, item.id, {
            serverItemTitle: updated.name,
            serverItemYear: updated.year ?? null,
          });
          result.updatedServerTitle = updated.name;
        }

        result.jellyfin = true;
      } catch (err) {
        console.warn(
          `[update-metadata] Jellyfin update failed for item ${item.jellyfinItemId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Plex items
    if (
      item.source === "plex" &&
      item.plexRatingKey &&
      plexEnabled &&
      plexUrl &&
      plexToken
    ) {
      try {
        await refreshPlexItem(
          plexUrl as string,
          plexToken as string,
          item.plexRatingKey,
        );

        // Re-fetch item to confirm and sync title back
        const updated = await getPlexItem(
          plexUrl as string,
          plexToken as string,
          item.plexRatingKey,
        );
        if (updated) {
          await updateSyncItem(db, item.id, {
            serverItemTitle: updated.title,
            serverItemYear: updated.year ?? null,
          });
          result.updatedServerTitle = updated.title;
        }

        result.plex = true;
      } catch (err) {
        console.warn(
          `[update-metadata] Plex refresh failed for item ${item.plexRatingKey}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return result;
}
