import { exec } from "node:child_process";
import { promisify } from "node:util";

import { eq } from "drizzle-orm";

import { db } from "@canto/db/client";
import { library, media, mediaFile, torrent } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";

const execAsync = promisify(exec);

/* -------------------------------------------------------------------------- */
/*  qBittorrent helpers                                                        */
/* -------------------------------------------------------------------------- */

interface QBTorrent {
  hash: string;
  name: string;
  state: string;
  progress: number;
  size: number;
  save_path: string;
  content_path: string;
  category: string;
}

interface QBTorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
}

let qbCookie: string | null = null;

async function qbLogin(): Promise<void> {
  const url = (await getSetting("qbittorrent.url")) ?? "";
  const user = (await getSetting("qbittorrent.username")) ?? "";
  const pass = (await getSetting("qbittorrent.password")) ?? "";
  const body = new URLSearchParams({ username: user, password: pass });
  const res = await fetch(`${url}/api/v2/auth/login`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    qbCookie = setCookie.split(";")[0] ?? null;
  }
}

async function qbFetch<T>(path: string): Promise<T> {
  const url = (await getSetting("qbittorrent.url")) ?? "";
  if (!qbCookie) await qbLogin();

  let res = await fetch(`${url}${path}`, {
    headers: qbCookie ? { Cookie: qbCookie } : {},
  });

  if (res.status === 403) {
    await qbLogin();
    res = await fetch(`${url}${path}`, {
      headers: qbCookie ? { Cookie: qbCookie } : {},
    });
  }

  if (!res.ok) {
    throw new Error(`qBittorrent ${path} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/* -------------------------------------------------------------------------- */
/*  SSH helper                                                                 */
/* -------------------------------------------------------------------------- */

async function sshExec(command: string): Promise<string> {
  const host = (await getSetting("mediaServer.host")) ?? "";
  const user = (await getSetting("mediaServer.user")) ?? "";
  if (!host || !user) throw new Error("Media server SSH not configured");
  const sshCmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${user}@${host} ${JSON.stringify(command)}`;
  const { stdout } = await execAsync(sshCmd, { timeout: 30000 });
  return stdout.trim();
}

/* -------------------------------------------------------------------------- */
/*  Naming helpers                                                             */
/* -------------------------------------------------------------------------- */

const VIDEO_EXTENSIONS = new Set([
  ".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".ts",
]);

const EPISODE_PATTERN = /[Ss](\d{1,2})[Ee](\d{1,3})/;

function isVideoFile(filename: string): boolean {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\.+$/, "")
    .trim();
}

function buildMediaDir(
  mediaItem: { title: string; year: number | null; externalId: number; provider: string; type: string },
  seasonNumber?: number,
): string {
  const safeTitle = sanitizeName(mediaItem.title);
  const yearSuffix = mediaItem.year ? ` (${mediaItem.year})` : "";
  const providerTag = mediaItem.provider === "tmdb" ? "tmdbid" : mediaItem.provider;
  const idTag = `[${providerTag}-${mediaItem.externalId}]`;
  const baseName = `${safeTitle}${yearSuffix} ${idTag}`;

  if (mediaItem.type === "movie") {
    return baseName;
  }

  const seasonPadded = String(seasonNumber ?? 1).padStart(2, "0");
  return `${baseName}/Season ${seasonPadded}`;
}

function detectQuality(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("2160p") || lower.includes("4k") || lower.includes("uhd")) return "uhd";
  if (lower.includes("1080p") || lower.includes("fullhd")) return "fullhd";
  if (lower.includes("720p")) return "hd";
  if (lower.includes("480p") || lower.includes("360p")) return "sd";
  return "unknown";
}

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
      const result = await importTorrent(row);
      if (result.success) {
        importedAny = true;
        lastLibraryId = result.libraryId;
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

async function importTorrent(
  row: typeof torrent.$inferSelect,
): Promise<{ success: boolean; libraryId?: string }> {
  if (!row.hash || !row.mediaId) return { success: false };

  const mediaRow = await db.query.media.findFirst({
    where: eq(media.id, row.mediaId),
    with: {
      seasons: {
        with: { episodes: true },
      },
    },
  });

  if (!mediaRow) {
    console.warn(`[import-torrents] Media not found for torrent "${row.title}"`);
    return { success: false };
  }

  // Fetch library to get configured paths
  const libraryRow = mediaRow.libraryId
    ? await db.query.library.findFirst({
        where: eq(library.id, mediaRow.libraryId),
      })
    : null;

  // Use library mediaPath, fall back to hardcoded defaults
  const basePath = libraryRow?.mediaPath
    ?? (mediaRow.type === "show" ? "/home/user/Medias/Shows" : "/home/user/Medias/Movies");

  const containerBasePath = libraryRow?.containerMediaPath
    ?? (mediaRow.type === "show" ? "/medias/Shows" : "/medias/Movies");

  // Get files list from qBittorrent
  const files = await qbFetch<QBTorrentFile[]>(
    `/api/v2/torrents/files?hash=${row.hash}`,
  );

  const videoFiles = files.filter((f) => isVideoFile(f.name));
  if (videoFiles.length === 0) {
    console.warn(`[import-torrents] No video files in torrent "${row.title}"`);
    await db
      .update(torrent)
      .set({ imported: true, updatedAt: new Date() })
      .where(eq(torrent.id, row.id));
    return { success: false };
  }

  const qbTorrents = await qbFetch<QBTorrent[]>("/api/v2/torrents/info");
  const qbt = qbTorrents.find((t) => t.hash === row.hash);
  if (!qbt) {
    console.warn(`[import-torrents] Torrent "${row.title}" not found in qBittorrent`);
    return { success: false };
  }

  let importedCount = 0;

  // Path conversion: container → host using library paths
  const containerToHost = (containerPath: string): string => {
    if (containerBasePath && basePath && containerPath.startsWith(containerBasePath)) {
      return containerPath.replace(containerBasePath, basePath);
    }
    // Legacy fallback
    if (containerPath.startsWith("/medias/")) {
      return containerPath.replace("/medias/", "/home/user/Medias/");
    }
    if (containerPath.startsWith("/downloads/")) {
      return containerPath.replace("/downloads/", "/home/user/Medias/Downloads/");
    }
    return containerPath;
  };

  for (const vf of videoFiles) {
    try {
      let seasonNumber = row.seasonNumber ?? undefined;
      let episodeId: string | undefined;
      const ext = vf.name.substring(vf.name.lastIndexOf("."));

      if (mediaRow.type === "show") {
        const match = EPISODE_PATTERN.exec(vf.name);
        if (match) {
          seasonNumber = parseInt(match[1]!, 10);
          const episodeNum = parseInt(match[2]!, 10);

          const matchedSeason = mediaRow.seasons?.find((s) => s.number === seasonNumber);
          const matchedEpisode = matchedSeason?.episodes?.find((e) => e.number === episodeNum);
          if (matchedEpisode) episodeId = matchedEpisode.id;
        }
      }

      const mediaDir = buildMediaDir(mediaRow, seasonNumber);
      const targetDir = `${basePath}/${mediaDir}`;

      let targetFilename: string;
      if (mediaRow.type === "show" && seasonNumber !== undefined) {
        const match = EPISODE_PATTERN.exec(vf.name);
        if (match) {
          const sn = String(parseInt(match[1]!, 10)).padStart(2, "0");
          const en = String(parseInt(match[2]!, 10)).padStart(2, "0");
          targetFilename = `S${sn}E${en}${ext}`;
        } else {
          targetFilename = sanitizeName(vf.name.substring(vf.name.lastIndexOf("/") + 1));
        }
      } else {
        const yearSuffix = mediaRow.year ? ` (${mediaRow.year})` : "";
        targetFilename = `${sanitizeName(mediaRow.title)}${yearSuffix}${ext}`;
      }

      const sourcePath = containerToHost(`${qbt.save_path}/${vf.name}`);
      const targetPath = `${targetDir}/${targetFilename}`;

      await sshExec(`mkdir -p '${targetDir}'`);
      await sshExec(`cp '${sourcePath}' '${targetPath}'`);

      console.log(`[import-torrents] Organized: ${vf.name} → ${targetPath}`);

      const existingFile = await db.query.mediaFile.findFirst({
        where: eq(mediaFile.filePath, targetPath),
      });

      if (!existingFile) {
        await db.insert(mediaFile).values({
          mediaId: mediaRow.id,
          episodeId: episodeId ?? null,
          torrentId: row.id,
          filePath: targetPath,
          quality: row.quality !== "unknown" ? row.quality : detectQuality(vf.name),
          sizeBytes: vf.size,
        });
        importedCount++;
      }
    } catch (err) {
      console.error(
        `[import-torrents] Error organizing "${vf.name}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  await db
    .update(torrent)
    .set({
      imported: true,
      contentPath: `${basePath}/${buildMediaDir(mediaRow, row.seasonNumber ?? undefined)}`,
      updatedAt: new Date(),
    })
    .where(eq(torrent.id, row.id));

  console.log(
    `[import-torrents] Imported ${importedCount} file(s) for "${mediaRow.title}" from "${row.title}"`,
  );

  return { success: importedCount > 0, libraryId: mediaRow.libraryId ?? undefined };
}

export async function importSingleTorrent(torrentId: string): Promise<boolean> {
  const row = await db.query.torrent.findFirst({
    where: eq(torrent.id, torrentId),
  });

  if (!row || !row.hash || !row.mediaId) return false;
  if (row.imported) return true;

  try {
    const result = await importTorrent(row);
    if (result.success) await triggerMediaServerScans(result.libraryId);
    return result.success;
  } catch (err) {
    console.error(
      `[import-torrents] Error importing "${row.title}":`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
