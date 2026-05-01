/* -------------------------------------------------------------------------- */
/*  Use-case: Trigger library scans on connected media servers               */
/* -------------------------------------------------------------------------- */

import { getSetting } from "@canto/db/settings";
import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import type { JellyfinAdapterPort } from "@canto/core/domain/media-servers/ports/jellyfin-adapter.port";
import type { PlexAdapterPort } from "@canto/core/domain/media-servers/ports/plex-adapter.port";
import type { ServerCredentialsPort } from "@canto/core/domain/media-servers/ports/server-credentials.port";

export interface ImportedMedia {
  id: string;
  title: string;
  type: string;
  externalId: number;
  provider: string;
  /** Number of imported media_file rows Canto has for this media. */
  mediaFileCount: number;
}

export interface TriggerMediaServerScansDeps {
  folders: FoldersRepositoryPort;
  credentials: ServerCredentialsPort;
  plex: PlexAdapterPort;
  jellyfin: JellyfinAdapterPort;
}

const AUTO_MERGE_MAX_ATTEMPTS = 20;
const AUTO_MERGE_DELAY_MS = 3000;

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
  jellyfin: JellyfinAdapterPort,
  url: string,
  apiKey: string,
  media: ImportedMedia,
): Promise<void> {
  for (let attempt = 0; attempt < AUTO_MERGE_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, AUTO_MERGE_DELAY_MS));
    const items = await jellyfin
      .findMoviesByProviderId(url, apiKey, media)
      .catch(() => []);

    if (items.length >= media.mediaFileCount) {
      if (items.length >= 2) {
        console.log(
          `[auto-merge] Merging ${items.length} Jellyfin items for "${media.title}"`,
        );
        await jellyfin.mergeVersions(url, apiKey, items.map((it) => it.id));
      }
      return;
    }
  }
  console.warn(
    `[auto-merge] Timed out waiting for Jellyfin to index "${media.title}" — expected ${media.mediaFileCount}, merge skipped`,
  );
}

export async function triggerMediaServerScans(
  deps: TriggerMediaServerScansDeps,
  importedMedias: ImportedMedia[] = [],
): Promise<void> {
  const links = await deps.folders.findAllServerLinks();
  if (links.length === 0) return;

  const jellyfinCreds = await deps.credentials.getJellyfin();
  const plexCreds = await deps.credentials.getPlex();

  for (const link of links) {
    if (link.serverType === "jellyfin" && jellyfinCreds) {
      try {
        await deps.jellyfin.triggerScan(
          jellyfinCreds.url,
          jellyfinCreds.apiKey,
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

    if (link.serverType === "plex" && plexCreds) {
      try {
        await deps.plex.scanLibrary(
          plexCreds.url,
          plexCreds.token,
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
  if (jellyfinCreds && importedMedias.length > 0) {
    const autoMerge = await isAutoMergeEnabled();
    if (autoMerge) {
      const candidates = importedMedias.filter(
        (m) => m.type === "movie" && m.mediaFileCount >= 2,
      );
      for (const media of candidates) {
        await tryJellyfinAutoMergeForMedia(
          deps.jellyfin,
          jellyfinCreds.url,
          jellyfinCreds.apiKey,
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
