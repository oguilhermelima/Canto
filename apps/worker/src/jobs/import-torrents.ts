import { eq } from "drizzle-orm";

import { db } from "@canto/db/client";
import { library, media, torrent } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import { searchTorrents } from "@canto/api/domain/use-cases/search-torrents";
import { downloadTorrent } from "@canto/api/domain/use-cases/download-torrent";
import { autoImportTorrent } from "@canto/api/domain/use-cases/import-torrent";
import { getQBClient } from "@canto/api/infrastructure/adapters/qbittorrent";

/* -------------------------------------------------------------------------- */
/*  Media server scan trigger                                                  */
/* -------------------------------------------------------------------------- */

async function triggerMediaServerScans(libraryId?: string): Promise<void> {
  // Jellyfin
  const jellyfinUrl = await getSetting("jellyfin.url");
  const jellyfinKey = await getSetting("jellyfin.apiKey");
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
  const plexUrl = await getSetting("plex.url");
  const plexToken = await getSetting("plex.token");
  if (plexUrl && plexToken && libraryId) {
    const lib = await db.query.library.findFirst({
      where: eq(library.id, libraryId),
    });
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
  const rows = await db.query.torrent.findMany({
    where: eq(torrent.imported, false),
  });

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
      const updated = await db.query.torrent.findFirst({
        where: eq(torrent.id, row.id),
      });

      if (updated?.imported) {
        importedAny = true;
        // Get the library ID from the linked media
        const mediaRow = updated.mediaId
          ? await db.query.media.findFirst({
              where: eq(media.id, updated.mediaId),
            })
          : null;
        lastLibraryId = mediaRow?.libraryId ?? undefined;

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
          ).catch(() => {});
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
    const results = await searchTorrents(db, {
      mediaId: mediaRow.id,
      seasonNumber: importedSeasonNumber,
      episodeNumbers: [nextEp],
    });

    if (results.length === 0) {
      console.log(`[continuous-download] No results for next episode`);
      return;
    }

    const best = results[0]!;
    console.log(`[continuous-download] Auto-downloading "${best.title}" (confidence: ${best.confidence})`);

    await downloadTorrent(db, {
      mediaId: mediaRow.id,
      title: best.title,
      magnetUrl: best.magnetUrl ?? undefined,
      torrentUrl: best.downloadUrl ?? undefined,
      seasonNumber: importedSeasonNumber,
      episodeNumbers: [nextEp],
    });
  } catch (err) {
    console.warn(
      `[continuous-download] Failed for "${mediaRow.title}":`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function importSingleTorrent(torrentId: string): Promise<boolean> {
  const row = await db.query.torrent.findFirst({
    where: eq(torrent.id, torrentId),
  });

  if (!row || !row.hash || !row.mediaId) return false;
  if (row.imported) return true;

  try {
    const qbClient = await getQBClient();
    await autoImportTorrent(db, row, qbClient);

    // Re-read row to check if import succeeded
    const updated = await db.query.torrent.findFirst({
      where: eq(torrent.id, row.id),
    });

    if (updated?.imported) {
      const linkedMedia = updated.mediaId
        ? await db.query.media.findFirst({ where: eq(media.id, updated.mediaId) })
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
