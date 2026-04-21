/* -------------------------------------------------------------------------- */
/*  Use-case: Trigger library scans on connected media servers               */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import { getSetting, getSettings } from "@canto/db/settings";
import { findAllServerLinks } from "../../../infrastructure/repositories";
import {
  triggerJellyfinScan,
  findJellyfinMoviesByProviderId,
  mergeJellyfinVersions,
} from "../../../infrastructure/adapters/media-servers/jellyfin";
import { scanPlexLibrary } from "../../../infrastructure/adapters/media-servers/plex";

export interface ImportedMedia {
  id: string;
  title: string;
  type: string;
  externalId: number;
  provider: string;
  /** Number of imported media_file rows Canto has for this media. */
  mediaFileCount: number;
}

async function isAutoMergeEnabled(): Promise<boolean> {
  const value = await getSetting("autoMergeVersions");
  if (value === undefined || value === null) return true;
  return value === true;
}

/**
 * Poll Jellyfin until it has indexed the expected number of items for a
 * media, then merge them into a single multi-version entry. Scans are
 * async so we can't assume the items exist the moment we trigger the scan.
 */
async function tryJellyfinAutoMergeForMedia(
  url: string,
  apiKey: string,
  media: ImportedMedia,
): Promise<void> {
  const MAX_ATTEMPTS = 20;
  const DELAY_MS = 3000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    const items = await findJellyfinMoviesByProviderId(url, apiKey, media).catch(() => []);

    if (items.length >= media.mediaFileCount) {
      if (items.length >= 2) {
        console.log(
          `[auto-merge] Merging ${items.length} Jellyfin items for "${media.title}"`,
        );
        await mergeJellyfinVersions(url, apiKey, items.map((it) => it.id));
      }
      return;
    }
  }
  console.warn(
    `[auto-merge] Timed out waiting for Jellyfin to index "${media.title}" — expected ${media.mediaFileCount}, merge skipped`,
  );
}

export async function triggerMediaServerScans(
  db: Database,
  importedMedias: ImportedMedia[] = [],
): Promise<void> {
  const links = await findAllServerLinks(db);
  if (links.length === 0) return;

  const {
    "jellyfin.url": jellyfinUrl,
    "jellyfin.apiKey": jellyfinKey,
    "plex.url": plexUrl,
    "plex.token": plexToken,
  } = await getSettings([
    "jellyfin.url",
    "jellyfin.apiKey",
    "plex.url",
    "plex.token",
  ]);

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

  // Post-scan auto-merge for Jellyfin multi-version movies.
  // Plex detects multi-versions automatically from folder layout — nothing to do.
  if (jellyfinUrl && jellyfinKey && importedMedias.length > 0) {
    const autoMerge = await isAutoMergeEnabled();
    if (autoMerge) {
      const candidates = importedMedias.filter(
        (m) => m.type === "movie" && m.mediaFileCount >= 2,
      );
      for (const media of candidates) {
        await tryJellyfinAutoMergeForMedia(
          jellyfinUrl as string,
          jellyfinKey as string,
          media,
        ).catch((err) =>
          console.warn(
            `[auto-merge] Failed for "${media.title}":`,
            err instanceof Error ? err.message : err,
          ),
        );
      }
    }
  }
}
