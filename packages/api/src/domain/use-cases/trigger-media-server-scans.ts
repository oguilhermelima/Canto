/* -------------------------------------------------------------------------- */
/*  Use-case: Trigger library scans on connected media servers               */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import { findAllServerLinks } from "../../infrastructure/repositories";
import { triggerJellyfinScan } from "../../infrastructure/adapters/jellyfin";
import { scanPlexLibrary } from "../../infrastructure/adapters/plex";

export async function triggerMediaServerScans(db: Database): Promise<void> {
  const links = await findAllServerLinks(db);
  if (links.length === 0) return;

  const jellyfinUrl = await getSetting<string>(SETTINGS.JELLYFIN_URL);
  const jellyfinKey = await getSetting<string>(SETTINGS.JELLYFIN_API_KEY);
  const plexUrl = await getSetting<string>(SETTINGS.PLEX_URL);
  const plexToken = await getSetting<string>(SETTINGS.PLEX_TOKEN);

  for (const link of links) {
    if (link.serverType === "jellyfin" && jellyfinUrl && jellyfinKey) {
      try {
        await triggerJellyfinScan(
          jellyfinUrl as string,
          jellyfinKey as string,
          link.serverLibraryId ?? undefined,
        );
        console.log(
          link.serverLibraryId
            ? `[import-torrents] Triggered Jellyfin scan for library ${link.serverLibraryId}`
            : "[import-torrents] Triggered Jellyfin full library scan",
        );
      } catch (err) {
        console.warn("[import-torrents] Failed to trigger Jellyfin scan:", err);
      }
    }

    if (link.serverType === "plex" && plexUrl && plexToken) {
      try {
        await scanPlexLibrary(
          plexUrl as string,
          plexToken as string,
          link.serverLibraryId ? [link.serverLibraryId] : undefined,
        );
        console.log(`[import-torrents] Triggered Plex scan for section ${link.serverLibraryId}`);
      } catch (err) {
        console.warn("[import-torrents] Failed to trigger Plex scan:", err);
      }
    }
  }
}
