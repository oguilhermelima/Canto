import { and, eq } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { library, media, mediaFile, torrent } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import { getJellyfinCredentials } from "../../lib/server-credentials";
import type { QBittorrentClient } from "../../infrastructure/adapters/qbittorrent";
import { isVideoFile, sanitizeName, buildMediaDir, buildFileName } from "../rules/naming";
import { EP_PATTERN, BARE_EP_PATTERN } from "../rules/parsing";

async function triggerMediaServerScans(db: Database, libraryId?: string): Promise<void> {
  const jellyfinUrl = await getSetting("jellyfin.url");
  const jellyfinKey = await getSetting("jellyfin.apiKey");
  if (jellyfinUrl && jellyfinKey) {
    void fetch(`${jellyfinUrl}/Library/Refresh`, {
      method: "POST",
      headers: { "X-Emby-Token": jellyfinKey },
    }).catch(() => {});
  }

  const plexUrl = await getSetting("plex.url");
  const plexToken = await getSetting("plex.token");
  if (plexUrl && plexToken && libraryId) {
    const lib = await db.query.library.findFirst({
      where: eq(library.id, libraryId),
    });
    if (lib?.plexLibraryId) {
      void fetch(
        `${plexUrl}/library/sections/${lib.plexLibraryId}/refresh?X-Plex-Token=${plexToken}`,
      ).catch(() => {});
    }
  }
}

async function autoMergeIfEnabled(
  mediaRow: { title: string; externalId: number; provider: string; type: string },
): Promise<void> {
  try {
    const jellyfinCreds = await getJellyfinCredentials();
    if (!jellyfinCreds) return;

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const searchRes = await fetch(
      `${jellyfinCreds.url}/Items?searchTerm=${encodeURIComponent(mediaRow.title)}&Recursive=true&IncludeItemTypes=${mediaRow.type === "movie" ? "Movie" : "Series"}&Fields=Path,ProviderIds`,
      { headers: { "X-Emby-Token": jellyfinCreds.apiKey } },
    );
    if (!searchRes.ok) return;

    const searchData = await searchRes.json() as {
      Items: Array<{ Id: string; Name: string; ProviderIds?: Record<string, string> }>;
    };

    const tmdbId = String(mediaRow.externalId);
    const matchingItems = searchData.Items.filter((item) => {
      const providerTmdb = item.ProviderIds?.Tmdb ?? item.ProviderIds?.tmdb;
      return providerTmdb === tmdbId;
    });

    if (matchingItems.length >= 2) {
      const ids = matchingItems.map((i) => i.Id).join(",");
      await fetch(`${jellyfinCreds.url}/Videos/MergeVersions?Ids=${ids}`, {
        method: "POST",
        headers: { "X-Emby-Token": jellyfinCreds.apiKey },
      });
      console.log(`[auto-import] Merged ${matchingItems.length} Jellyfin versions for "${mediaRow.title}"`);
    }
  } catch (err) {
    console.warn("[auto-import] Auto-merge failed:", err instanceof Error ? err.message : err);
  }
}

export async function autoImportTorrent(
  db: Database,
  torrentRow: typeof torrent.$inferSelect,
  qbClient: QBittorrentClient,
): Promise<void> {
  if (!torrentRow.hash || !torrentRow.mediaId) return;

  const mediaRow = await db.query.media.findFirst({
    where: eq(media.id, torrentRow.mediaId),
    with: { seasons: { with: { episodes: true } } },
  });
  if (!mediaRow) return;

  const placeholders = await db.query.mediaFile.findMany({
    where: and(eq(mediaFile.torrentId, torrentRow.id), eq(mediaFile.status, "pending")),
  });

  const libRow = mediaRow.libraryId
    ? await db.query.library.findFirst({ where: eq(library.id, mediaRow.libraryId) })
    : null;
  const containerBasePath = libRow?.containerMediaPath
    ?? (mediaRow.type === "show" ? "/medias/Shows" : "/medias/Movies");

  const files = await qbClient.getTorrentFiles(torrentRow.hash);
  const videoFiles = files.filter((f) => isVideoFile(f.name));
  if (videoFiles.length === 0) return;

  const mediaNaming = {
    title: mediaRow.title,
    year: mediaRow.year,
    externalId: mediaRow.externalId,
    provider: mediaRow.provider,
    type: mediaRow.type,
  };

  let primarySeasonNumber = torrentRow.seasonNumber ?? undefined;
  if (!primarySeasonNumber && mediaRow.type === "show") {
    const match = EP_PATTERN.exec(videoFiles[0]?.name ?? "");
    if (match) {
      primarySeasonNumber = parseInt(match[1]!, 10);
    } else {
      primarySeasonNumber = 1;
    }
  }

  const mediaDir = buildMediaDir(mediaNaming, primarySeasonNumber);
  const targetLocation = `${containerBasePath}/${mediaDir}`;

  try {
    await qbClient.setLocation(torrentRow.hash, targetLocation);
    console.log(`[auto-import] Moved "${torrentRow.title}" → ${targetLocation}`);
  } catch (err) {
    console.error(`[auto-import] setLocation failed:`, err instanceof Error ? err.message : err);
    await db.update(torrent).set({ importing: false }).where(eq(torrent.id, torrentRow.id));
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const movedFiles = await qbClient.getTorrentFiles(torrentRow.hash);
  const movedVideoFiles = movedFiles.filter((f) => isVideoFile(f.name));

  let importedCount = 0;

  for (const vf of movedVideoFiles) {
    try {
      let seasonNumber = primarySeasonNumber;
      let episodeId: string | undefined;
      const ext = vf.name.substring(vf.name.lastIndexOf("."));

      let epNum: number | undefined;
      if (mediaRow.type === "show") {
        const match = EP_PATTERN.exec(vf.name);
        if (match) {
          seasonNumber = parseInt(match[1]!, 10);
          epNum = parseInt(match[2]!, 10);
        } else {
          const bareMatch = BARE_EP_PATTERN.exec(vf.name);
          if (bareMatch) {
            epNum = parseInt(bareMatch[1]!, 10);
          }
        }
        if (epNum !== undefined && seasonNumber !== undefined) {
          const matchedSeason = mediaRow.seasons?.find((s) => s.number === seasonNumber);
          const matchedEp = matchedSeason?.episodes?.find((e) => e.number === epNum);
          if (matchedEp) episodeId = matchedEp.id;
        }
      }

      let targetFilename: string;
      if (epNum !== undefined || mediaRow.type === "movie") {
        targetFilename = buildFileName(mediaNaming, {
          seasonNumber,
          episodeNumber: epNum,
          quality: torrentRow.quality,
          source: torrentRow.source,
          extension: ext,
        });
      } else {
        targetFilename = sanitizeName(vf.name.substring(vf.name.lastIndexOf("/") + 1));
      }

      if (vf.name !== targetFilename) {
        try {
          await qbClient.renameFile(torrentRow.hash, vf.name, targetFilename);
        } catch {
          console.warn(`[auto-import] renameFile failed for "${vf.name}", skipping rename`);
        }
      }

      const hostTargetLocation = (libRow?.mediaPath && libRow?.containerMediaPath)
        ? targetLocation.replace(libRow.containerMediaPath, libRow.mediaPath)
        : targetLocation.replace("/medias/", "/home/user/Medias/");
      const finalPath = `${hostTargetLocation}/${targetFilename}`;

      if (episodeId) {
        const placeholder = placeholders.find((p) => p.episodeId === episodeId);
        if (placeholder) {
          await db.update(mediaFile)
            .set({ filePath: finalPath, sizeBytes: vf.size, status: "imported" })
            .where(eq(mediaFile.id, placeholder.id));
          importedCount++;
        } else {
          await db.insert(mediaFile).values({
            mediaId: mediaRow.id,
            episodeId,
            torrentId: torrentRow.id,
            filePath: finalPath,
            quality: torrentRow.quality,
            source: torrentRow.source,
            sizeBytes: vf.size,
            status: "imported",
          }).onConflictDoNothing();
          importedCount++;
        }
      } else if (mediaRow.type === "movie") {
        const placeholder = placeholders.find((p) => !p.episodeId);
        if (placeholder) {
          await db.update(mediaFile)
            .set({ filePath: finalPath, sizeBytes: vf.size, status: "imported" })
            .where(eq(mediaFile.id, placeholder.id));
          importedCount++;
        }
      }
    } catch (err) {
      console.error(`[auto-import] File error "${vf.name}":`, err instanceof Error ? err.message : err);
    }
  }

  // Cleanup empty subfolder check
  const firstOriginalFile = movedVideoFiles[0];
  if (firstOriginalFile && firstOriginalFile.name.includes("/")) {
    const torrentSubfolder = firstOriginalFile.name.substring(0, firstOriginalFile.name.indexOf("/"));
    if (torrentSubfolder) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const currentFiles = await qbClient.getTorrentFiles(torrentRow.hash);
        const stillInSubfolder = currentFiles.some((f) => f.name.startsWith(torrentSubfolder + "/"));
        if (!stillInSubfolder) {
          console.log(`[auto-import] Torrent subfolder "${torrentSubfolder}" is now empty`);
        }
      } catch {
        // Non-critical
      }
    }
  }

  const hostContentPath = (libRow?.mediaPath && libRow?.containerMediaPath)
    ? targetLocation.replace(libRow.containerMediaPath, libRow.mediaPath)
    : targetLocation.replace("/medias/", "/home/user/Medias/");

  await db.update(torrent).set({
    imported: true,
    importing: false,
    contentPath: hostContentPath,
    updatedAt: new Date(),
  }).where(eq(torrent.id, torrentRow.id));

  if (importedCount > 0) {
    console.log(`[auto-import] Imported ${importedCount} file(s) for "${mediaRow.title}"`);
    await triggerMediaServerScans(db, mediaRow.libraryId ?? undefined);
    await autoMergeIfEnabled(mediaRow);
  }
}
