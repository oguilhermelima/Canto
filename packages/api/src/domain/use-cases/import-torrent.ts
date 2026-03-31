import type { Database } from "@canto/db/client";
import type { torrent as torrentSchema } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import { getJellyfinCredentials } from "../../lib/server-credentials";
import { scanJellyfinLibrary, mergeJellyfinVersions } from "../../infrastructure/adapters/jellyfin";
import { scanPlexLibrary } from "../../infrastructure/adapters/plex";
import type { QBittorrentClient } from "../../infrastructure/adapters/qbittorrent";
import { isVideoFile, sanitizeName, buildMediaDir, buildFileName } from "../rules/naming";
import { EP_PATTERN, BARE_EP_PATTERN, isSubtitleFile, parseSubtitleLanguage } from "../rules/parsing";
import { createNotification } from "./create-notification";
import {
  findMediaByIdWithSeasons,
  findLibraryById,
  findMediaFilesByTorrentId,
  updateMediaFile,
  createMediaFileNoConflict,
  updateTorrent,
} from "../../infrastructure/repositories";

async function triggerMediaServerScans(db: Database, libraryId?: string): Promise<void> {
  const jellyfinUrl = await getSetting(SETTINGS.JELLYFIN_URL);
  const jellyfinKey = await getSetting(SETTINGS.JELLYFIN_API_KEY);
  if (jellyfinUrl && jellyfinKey) {
    void scanJellyfinLibrary(jellyfinUrl, jellyfinKey).catch(() => {});
  }

  const plexUrl = await getSetting(SETTINGS.PLEX_URL);
  const plexToken = await getSetting(SETTINGS.PLEX_TOKEN);
  if (plexUrl && plexToken && libraryId) {
    const lib = await findLibraryById(db, libraryId);
    if (lib?.plexLibraryId) {
      void scanPlexLibrary(plexUrl, plexToken, [lib.plexLibraryId]).catch(() => {});
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
      await mergeJellyfinVersions(jellyfinCreds.url, jellyfinCreds.apiKey, matchingItems.map((i) => i.Id));
      console.log(`[auto-import] Merged ${matchingItems.length} Jellyfin versions for "${mediaRow.title}"`);
    }
  } catch (err) {
    console.warn("[auto-import] Auto-merge failed:", err instanceof Error ? err.message : err);
  }
}

export async function autoImportTorrent(
  db: Database,
  torrentRow: typeof torrentSchema.$inferSelect,
  qbClient: QBittorrentClient,
): Promise<void> {
  if (!torrentRow.hash || !torrentRow.mediaId) return;

  const mediaRow = await findMediaByIdWithSeasons(db, torrentRow.mediaId);
  if (!mediaRow) return;

  const placeholders = await findMediaFilesByTorrentId(db, torrentRow.id, "pending");

  const libRow = mediaRow.libraryId
    ? await findLibraryById(db, mediaRow.libraryId)
    : null;
  const containerBasePath = libRow?.containerMediaPath
    ?? (mediaRow.type === "show" ? "/medias/Shows" : "/medias/Movies");

  const files = await qbClient.getTorrentFiles(torrentRow.hash);
  const videoFiles = files.filter((f) => isVideoFile(f.name));
  const subtitleFiles = files.filter((f) => isSubtitleFile(f.name));

  if (videoFiles.length === 0) return;

  // Movie validation: warn if multiple video files (likely a pack, not a single movie)
  if (mediaRow.type === "movie" && videoFiles.length > 1) {
    console.warn(
      `[auto-import] Movie "${mediaRow.title}" has ${videoFiles.length} video files — skipping auto-import (expected single file)`,
    );
    await createNotification(db, {
      title: "Movie import skipped",
      message: `"${mediaRow.title}" has ${videoFiles.length} video files — expected a single file for movies.`,
      type: "movie_multi_file",
      mediaId: mediaRow.id,
    });
    await updateTorrent(db, torrentRow.id, { importing: false });
    return;
  }

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
    await updateTorrent(db, torrentRow.id, { importing: false });
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
          await updateMediaFile(db, placeholder.id, {
            filePath: finalPath,
            sizeBytes: vf.size,
            status: "imported",
          });
          importedCount++;
        } else {
          await createMediaFileNoConflict(db, {
            mediaId: mediaRow.id,
            episodeId,
            torrentId: torrentRow.id,
            filePath: finalPath,
            quality: torrentRow.quality,
            source: torrentRow.source,
            sizeBytes: vf.size,
            status: "imported",
          });
          importedCount++;
        }
      } else if (mediaRow.type === "movie") {
        const placeholder = placeholders.find((p) => !p.episodeId);
        if (placeholder) {
          await updateMediaFile(db, placeholder.id, {
            filePath: finalPath,
            sizeBytes: vf.size,
            status: "imported",
          });
          importedCount++;
        }
      }
    } catch (err) {
      console.error(`[auto-import] File error "${vf.name}":`, err instanceof Error ? err.message : err);
    }
  }

  // Rename and move subtitle files alongside their video
  for (const sf of subtitleFiles) {
    try {
      const lang = parseSubtitleLanguage(sf.name);
      const subExt = sf.name.substring(sf.name.lastIndexOf("."));
      const langSuffix = lang ? `.${lang}` : "";

      // Match subtitle to video by episode number
      let targetSubName: string | undefined;
      if (mediaRow.type === "show") {
        const match = EP_PATTERN.exec(sf.name) ?? BARE_EP_PATTERN.exec(sf.name);
        if (match) {
          const epNum = parseInt(match[EP_PATTERN.exec(sf.name) ? 2 : 1]!, 10);
          const sNum = EP_PATTERN.exec(sf.name)?.[1]
            ? parseInt(EP_PATTERN.exec(sf.name)![1]!, 10)
            : primarySeasonNumber;
          targetSubName = buildFileName(mediaNaming, {
            seasonNumber: sNum,
            episodeNumber: epNum,
            quality: torrentRow.quality,
            source: torrentRow.source,
            extension: `${langSuffix}${subExt}`,
          });
        }
      } else {
        // Movie subtitle
        targetSubName = buildFileName(mediaNaming, {
          quality: torrentRow.quality,
          source: torrentRow.source,
          extension: `${langSuffix}${subExt}`,
        });
      }

      if (targetSubName) {
        try {
          await qbClient.renameFile(torrentRow.hash, sf.name, targetSubName);
          console.log(`[auto-import] Renamed subtitle: ${sf.name} → ${targetSubName}`);
        } catch {
          console.warn(`[auto-import] renameFile failed for subtitle "${sf.name}"`);
        }
      }
    } catch {
      // Non-critical — skip subtitle
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

  await updateTorrent(db, torrentRow.id, {
    imported: true,
    importing: false,
    contentPath: hostContentPath,
  });

  if (importedCount > 0) {
    console.log(`[auto-import] Imported ${importedCount} file(s) for "${mediaRow.title}"`);
    await triggerMediaServerScans(db, mediaRow.libraryId ?? undefined);
    await autoMergeIfEnabled(mediaRow);
    await createNotification(db, {
      title: "Import complete",
      message: `Imported ${importedCount} file(s) for "${mediaRow.title}"`,
      type: "import_success",
      mediaId: mediaRow.id,
    });
  }
}
