import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "@canto/api/lib/settings-keys";
import { searchTorrents } from "@canto/api/domain/use-cases/search-torrents";
import { downloadTorrent } from "@canto/api/domain/use-cases/download-torrent";
import { autoImportTorrent } from "@canto/api/domain/use-cases/import-torrent";
import { getQBClient } from "@canto/api/infrastructure/adapters/qbittorrent";
import { getJackettClient } from "@canto/api/infrastructure/adapters/jackett";
import { getProwlarrClient } from "@canto/api/infrastructure/adapters/prowlarr";
import type { IndexerPort } from "@canto/api/domain/ports";
import {
  findUnimportedTorrents,
  findTorrentById,
  findMediaById,
  findLibraryById,
  ensureServerLibrary,
  addListItem,
  updateRequestStatus,
} from "@canto/api/infrastructure/repositories";
import { logAndSwallow } from "@canto/api/lib/log-error";

/* -------------------------------------------------------------------------- */
/*  Media server scan trigger                                                  */
/* -------------------------------------------------------------------------- */

async function triggerMediaServerScans(libraryId?: string): Promise<void> {
  // Jellyfin
  const jellyfinUrl = await getSetting(SETTINGS.JELLYFIN_URL);
  const jellyfinKey = await getSetting(SETTINGS.JELLYFIN_API_KEY);
  if (jellyfinUrl && jellyfinKey) {
    try {
      await fetch(`${jellyfinUrl}/Library/Refresh`, {
        method: "POST",
        headers: { "X-Emby-Token": jellyfinKey },
      });
      console.log("[import-torrents] Triggered Jellyfin library scan");
    } catch (err) {
      console.warn("[import-torrents] Failed to trigger Jellyfin scan:", err);
    }
  }

  // Plex
  const plexUrl = await getSetting(SETTINGS.PLEX_URL);
  const plexToken = await getSetting(SETTINGS.PLEX_TOKEN);
  if (plexUrl && plexToken && libraryId) {
    const lib = await findLibraryById(db, libraryId);
    if (lib?.plexLibraryId) {
      try {
        await fetch(
          `${plexUrl}/library/sections/${lib.plexLibraryId}/refresh?X-Plex-Token=${plexToken}`,
        );
        console.log("[import-torrents] Triggered Plex library scan");
      } catch (err) {
        console.warn("[import-torrents] Failed to trigger Plex scan:", err);
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Main handler                                                               */
/* -------------------------------------------------------------------------- */

export async function handleImportTorrents(): Promise<void> {
  const rows = await findUnimportedTorrents(db);

  const toImport = rows.filter(
    (r) => r.status === "completed" && r.hash && r.mediaId,
  );

  if (toImport.length === 0) return;

  console.log(
    `[import-torrents] Found ${toImport.length} completed torrent(s) to import`,
  );

  let importedAny = false;
  let lastLibraryId: string | undefined;

  for (const row of toImport) {
    try {
      const qbClient = await getQBClient();
      await autoImportTorrent(db, row, qbClient);

      // Re-read row to check if import succeeded
      const updated = await findTorrentById(db, row.id);

      if (updated?.imported) {
        importedAny = true;
        // Get the library ID from the linked media
        const mediaRow = updated.mediaId
          ? await findMediaById(db, updated.mediaId)
          : null;
        lastLibraryId = mediaRow?.libraryId ?? undefined;

        // Add to Server Library list
        if (updated.mediaId) {
          try {
            const serverLib = await ensureServerLibrary(db);
            await addListItem(db, { listId: serverLib.id, mediaId: updated.mediaId });
          } catch { /* already in server library */ }

          // Update download requests to "downloaded"
          try {
            await updateRequestStatus(db, updated.mediaId, "downloaded");
          } catch { /* no pending requests */ }
        }

        // Continuous download: try to grab next episode
        if (updated.mediaId && mediaRow) {
          void tryContinuousDownload(
            {
              id: mediaRow.id,
              type: mediaRow.type,
              continuousDownload: mediaRow.continuousDownload,
              title: mediaRow.title,
            },
            row.seasonNumber,
            row.episodeNumbers,
          ).catch(logAndSwallow("import-torrents tryContinuousDownload"));
        }
      }
    } catch (err) {
      console.error(
        `[import-torrents] Error importing "${row.title}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (importedAny) {
    await triggerMediaServerScans(lastLibraryId);
  }
}

/**
 * After a show episode import, check if continuous download is enabled.
 * If so, find the next un-downloaded episode and auto-download it.
 */
async function buildIndexers(): Promise<IndexerPort[]> {
  const indexers: IndexerPort[] = [];
  const prowlarrEnabled = (await getSetting<boolean>(SETTINGS.PROWLARR_ENABLED)) === true;
  const jackettEnabled = (await getSetting<boolean>(SETTINGS.JACKETT_ENABLED)) === true;
  if (prowlarrEnabled) indexers.push(await getProwlarrClient());
  if (jackettEnabled) indexers.push(await getJackettClient());
  return indexers;
}

async function tryContinuousDownload(
  mediaRow: { id: string; type: string; continuousDownload: boolean; title: string },
  importedSeasonNumber: number | null,
  importedEpisodeNumbers: number[] | null,
): Promise<void> {
  if (mediaRow.type !== "show" || !mediaRow.continuousDownload) return;
  if (!importedEpisodeNumbers?.length || !importedSeasonNumber) return;

  const lastImportedEp = Math.max(...importedEpisodeNumbers);
  const nextEp = lastImportedEp + 1;

  console.log(`[continuous-download] Searching next episode S${String(importedSeasonNumber).padStart(2, "0")}E${String(nextEp).padStart(2, "0")} for "${mediaRow.title}"`);

  try {
    const indexers = await buildIndexers();
    const { results } = await searchTorrents(db, {
      mediaId: mediaRow.id,
      seasonNumber: importedSeasonNumber,
      episodeNumbers: [nextEp],
    }, indexers);

    if (results.length === 0) {
      console.log(`[continuous-download] No results for next episode`);
      return;
    }

    const best = results[0]!;
    console.log(`[continuous-download] Auto-downloading "${best.title}" (confidence: ${best.confidence})`);

    const qbClient = await getQBClient();
    await downloadTorrent(db, {
      mediaId: mediaRow.id,
      title: best.title,
      magnetUrl: best.magnetUrl ?? undefined,
      torrentUrl: best.downloadUrl ?? undefined,
      seasonNumber: importedSeasonNumber,
      episodeNumbers: [nextEp],
    }, qbClient);
  } catch (err) {
    console.warn(
      `[continuous-download] Failed for "${mediaRow.title}":`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function importSingleTorrent(torrentId: string): Promise<boolean> {
  const row = await findTorrentById(db, torrentId);

  if (!row || !row.hash || !row.mediaId) return false;
  if (row.imported) return true;

  try {
    const qbClient = await getQBClient();
    await autoImportTorrent(db, row, qbClient);

    // Re-read row to check if import succeeded
    const updated = await findTorrentById(db, row.id);

    if (updated?.imported) {
      const linkedMedia = updated.mediaId
        ? await findMediaById(db, updated.mediaId)
        : null;
      await triggerMediaServerScans(linkedMedia?.libraryId ?? undefined);
      return true;
    }
    return false;
  } catch (err) {
    console.error(
      `[import-torrents] Error importing "${row.title}":`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
