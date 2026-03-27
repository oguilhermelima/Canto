import { eq } from "drizzle-orm";

import { db } from "@canto/db/client";
import { media, mediaFile, torrent } from "@canto/db/schema";

/* -------------------------------------------------------------------------- */
/*  qBittorrent types                                                         */
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

/* -------------------------------------------------------------------------- */
/*  qBittorrent helpers                                                       */
/* -------------------------------------------------------------------------- */

const QB_URL = process.env.QBITTORRENT_URL ?? "http://localhost:8080";
const QB_USER = process.env.QBITTORRENT_USERNAME ?? "admin";
const QB_PASS = process.env.QBITTORRENT_PASSWORD ?? "adminadmin";

let qbCookie: string | null = null;

async function qbLogin(): Promise<void> {
  const body = new URLSearchParams({ username: QB_USER, password: QB_PASS });
  const res = await fetch(`${QB_URL}/api/v2/auth/login`, {
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
  if (!qbCookie) await qbLogin();

  let res = await fetch(`${QB_URL}${path}`, {
    headers: qbCookie ? { Cookie: qbCookie } : {},
  });

  if (res.status === 403) {
    await qbLogin();
    res = await fetch(`${QB_URL}${path}`, {
      headers: qbCookie ? { Cookie: qbCookie } : {},
    });
  }

  if (!res.ok) {
    throw new Error(`qBittorrent ${path} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/* -------------------------------------------------------------------------- */
/*  Season/episode pattern matching                                           */
/* -------------------------------------------------------------------------- */

const EPISODE_PATTERN = /[Ss](\d{1,2})[Ee](\d{1,3})/;
const VIDEO_EXTENSIONS = new Set([
  ".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".ts",
]);

function isVideoFile(filename: string): boolean {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

function detectQuality(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("2160p") || lower.includes("4k") || lower.includes("uhd"))
    return "uhd";
  if (lower.includes("1080p") || lower.includes("fullhd")) return "fullhd";
  if (lower.includes("720p")) return "hd";
  if (lower.includes("480p") || lower.includes("360p")) return "sd";
  return "unknown";
}

/* -------------------------------------------------------------------------- */
/*  Main handler                                                              */
/* -------------------------------------------------------------------------- */

export async function handleImportTorrents(): Promise<void> {
  // 1. Get all torrents from qBittorrent
  const qbTorrents = await qbFetch<QBTorrent[]>("/api/v2/torrents/info");

  // 2. Find completed torrents (progress === 1)
  const completed = qbTorrents.filter((t) => t.progress >= 1);

  if (completed.length === 0) return;

  // 3. For each completed torrent, check if we have a DB record
  for (const qbt of completed) {
    // Look up torrent record by hash
    const torrentRow = await db.query.torrent.findFirst({
      where: eq(torrent.hash, qbt.hash),
    });

    if (!torrentRow) {
      // No DB record for this torrent — skip
      continue;
    }

    if (torrentRow.imported) {
      // Already imported — skip
      continue;
    }

    // 4. Get the list of files in this torrent
    const files = await qbFetch<QBTorrentFile[]>(
      `/api/v2/torrents/files?hash=${qbt.hash}`,
    );

    const videoFiles = files.filter((f) => isVideoFile(f.name));

    if (videoFiles.length === 0) {
      // Update status to error — no video files found
      await db
        .update(torrent)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(torrent.id, torrentRow.id));
      continue;
    }

    // 5. Try to match files to a media record
    // Find media records that could match the torrent title (fuzzy by title)
    // For a simple approach, look at all in_library media and try to match
    const allMedia = await db.query.media.findMany({
      where: eq(media.inLibrary, true),
      with: {
        seasons: {
          with: {
            episodes: true,
          },
        },
      },
    });

    // Try to find which media item this torrent belongs to
    // Match by checking if the torrent name contains the media title
    const torrentNameLower = qbt.name.toLowerCase();
    const matchedMedia = allMedia.find((m) => {
      const titleLower = m.title.toLowerCase().replace(/[^a-z0-9]+/g, " ");
      const torrentNorm = torrentNameLower.replace(/[^a-z0-9]+/g, " ");
      return torrentNorm.includes(titleLower);
    });

    if (!matchedMedia) {
      // Cannot match to a media item — mark as finished but do not import
      await db
        .update(torrent)
        .set({ status: "finished", updatedAt: new Date() })
        .where(eq(torrent.id, torrentRow.id));
      continue;
    }

    // 6. Create media_file records
    for (const vf of videoFiles) {
      const filePath = `${qbt.save_path}/${vf.name}`;
      const quality = detectQuality(vf.name);

      // For shows, try to extract season/episode from filename
      let episodeId: string | undefined;
      if (matchedMedia.type === "show") {
        const match = EPISODE_PATTERN.exec(vf.name);
        if (match) {
          const seasonNum = parseInt(match[1]!, 10);
          const episodeNum = parseInt(match[2]!, 10);

          const matchedSeason = matchedMedia.seasons?.find(
            (s) => s.number === seasonNum,
          );
          if (matchedSeason) {
            const matchedEpisode = matchedSeason.episodes?.find(
              (e) => e.number === episodeNum,
            );
            if (matchedEpisode) {
              episodeId = matchedEpisode.id;
            }
          }
        }
      }

      // Check if this file already exists
      const existingFile = await db.query.mediaFile.findFirst({
        where: eq(mediaFile.filePath, filePath),
      });

      if (!existingFile) {
        await db.insert(mediaFile).values({
          mediaId: matchedMedia.id,
          episodeId: episodeId ?? null,
          torrentId: torrentRow.id,
          filePath,
          quality,
          sizeBytes: vf.size,
        });
      }
    }

    // 7. Mark torrent as imported
    await db
      .update(torrent)
      .set({
        status: "finished",
        imported: true,
        quality: detectQuality(qbt.name),
        updatedAt: new Date(),
      })
      .where(eq(torrent.id, torrentRow.id));

    console.log(
      `[import-torrents] Imported ${videoFiles.length} files for "${matchedMedia.title}" from torrent "${qbt.name}"`,
    );
  }
}
