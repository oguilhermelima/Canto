import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@canto/db/client";
import { library, media, mediaFile, torrent } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import {
  torrentDownloadInput,
  torrentSearchInput,
} from "@canto/validators";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../trpc";

/* -------------------------------------------------------------------------- */
/*  qBittorrent API Client                                                    */
/* -------------------------------------------------------------------------- */

class QBittorrentClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private cookie: string | null = null;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
  }

  /** Authenticate with qBittorrent and store the session cookie. */
  private async login(): Promise<void> {
    const body = new URLSearchParams({
      username: this.username,
      password: this.password,
    });
    const response = await fetch(`${this.baseUrl}/api/v2/auth/login`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!response.ok) {
      throw new Error(`qBittorrent login failed: ${response.status}`);
    }

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      this.cookie = setCookie.split(";")[0] ?? null;
    }
  }

  /** Ensure we have a valid session. */
  private async ensureAuth(): Promise<void> {
    if (!this.cookie) {
      await this.login();
    }
  }

  /** Make an authenticated request to qBittorrent. */
  private async request(
    path: string,
    opts: RequestInit = {},
  ): Promise<Response> {
    await this.ensureAuth();

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...opts,
      headers: {
        ...(opts.headers as Record<string, string> | undefined),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
    });

    // If unauthorized, retry login once
    if (response.status === 403) {
      await this.login();
      return fetch(`${this.baseUrl}${path}`, {
        ...opts,
        headers: {
          ...(opts.headers as Record<string, string> | undefined),
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
      });
    }

    return response;
  }

  /** Add a torrent by magnet link or URL. */
  async addTorrent(
    magnetOrUrl: string,
    category?: string,
    savePath?: string,
  ): Promise<void> {
    const body = new URLSearchParams({ urls: magnetOrUrl });
    if (category) body.set("category", category);
    if (savePath) body.set("savepath", savePath);

    const response = await this.request("/api/v2/torrents/add", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`qBittorrent add torrent failed: ${response.status} ${text}`);
    }
  }

  /** List all torrents. */
  async listTorrents(): Promise<
    Array<{
      hash: string;
      name: string;
      state: string;
      progress: number;
      size: number;
      dlspeed: number;
      upspeed: number;
      eta: number;
      save_path: string;
      category: string;
      content_path: string;
      num_seeds: number;
      num_leechs: number;
      added_on: number;
      completion_on: number;
      ratio: number;
    }>
  > {
    const response = await this.request("/api/v2/torrents/info");
    if (!response.ok) {
      throw new Error(`qBittorrent list failed: ${response.status}`);
    }
    return response.json() as Promise<
      Array<{
        hash: string;
        name: string;
        state: string;
        progress: number;
        size: number;
        dlspeed: number;
        upspeed: number;
        eta: number;
        save_path: string;
        category: string;
        content_path: string;
        num_seeds: number;
        num_leechs: number;
        added_on: number;
        completion_on: number;
        ratio: number;
      }>
    >;
  }

  /** Pause a torrent by hash. */
  async pauseTorrent(hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    const response = await this.request("/api/v2/torrents/pause", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent pause failed: ${response.status}`);
    }
  }

  /** Resume a torrent by hash. */
  async resumeTorrent(hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    const response = await this.request("/api/v2/torrents/resume", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent resume failed: ${response.status}`);
    }
  }

  /** Delete a torrent by hash, optionally deleting files. */
  async deleteTorrent(hash: string, deleteFiles: boolean): Promise<void> {
    const body = new URLSearchParams({
      hashes: hash,
      deleteFiles: String(deleteFiles),
    });
    const response = await this.request("/api/v2/torrents/delete", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent delete failed: ${response.status}`);
    }
  }

  /** Set the category for a torrent by hash. */
  async setCategory(hash: string, category: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash, category });
    await this.request("/api/v2/torrents/setCategory", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  /** Get file list for a torrent by hash. */
  async getTorrentFiles(hash: string): Promise<Array<{ index: number; name: string; size: number; progress: number }>> {
    const response = await this.request(`/api/v2/torrents/files?hash=${hash}`);
    if (!response.ok) return [];
    return response.json() as Promise<Array<{ index: number; name: string; size: number; progress: number }>>;
  }

  /** Move torrent content to a new location on disk. */
  async setLocation(hash: string, location: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash, location });
    const response = await this.request("/api/v2/torrents/setLocation", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent setLocation failed: ${response.status}`);
    }
  }

  /** Rename a file within a torrent (qBit v4.2.1+). */
  async renameFile(hash: string, oldPath: string, newPath: string): Promise<void> {
    const body = new URLSearchParams({ hash, oldPath, newPath });
    const response = await this.request("/api/v2/torrents/renameFile", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent renameFile failed: ${response.status}`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Auto-import: organize files on media server via SSH after download         */
/* -------------------------------------------------------------------------- */

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v"]);
const EP_PATTERN = /[Ss](\d{1,2})[Ee](\d{1,3})/;

function isVideoFile(name: string): boolean {
  const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/\.+$/, "").trim();
}

async function triggerMediaServerScans(db: Database, libraryId?: string): Promise<void> {
  // Jellyfin: full library refresh
  const jellyfinUrl = await getSetting("jellyfin.url");
  const jellyfinKey = await getSetting("jellyfin.apiKey");
  if (jellyfinUrl && jellyfinKey) {
    void fetch(`${jellyfinUrl}/Library/Refresh`, {
      method: "POST",
      headers: { "X-Emby-Token": jellyfinKey },
    }).catch(() => {});
  }

  // Plex: targeted section refresh if library is linked
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

/**
 * If autoMergeVersions is enabled, find and merge duplicate Jellyfin items.
 */
async function autoMergeIfEnabled(
  _db: Database,
  mediaRow: { title: string; externalId: number; provider: string; type: string },
  _torrentRow: { id: string },
): Promise<void> {
  try {
    // Check user preference (default: true)
    // For now, always merge. User preference check will come from Phase 4.

    if (!JELLYFIN_URL_ENV || !JELLYFIN_API_KEY_ENV) return;

    // Wait for Jellyfin scan to process
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Search for items matching this media
    const searchRes = await fetch(
      `${JELLYFIN_URL_ENV}/Items?searchTerm=${encodeURIComponent(mediaRow.title)}&Recursive=true&IncludeItemTypes=${mediaRow.type === "movie" ? "Movie" : "Series"}&Fields=Path,ProviderIds`,
      { headers: { "X-Emby-Token": JELLYFIN_API_KEY_ENV } },
    );
    if (!searchRes.ok) return;

    const searchData = await searchRes.json() as { Items: Array<{ Id: string; Name: string; ProviderIds?: Record<string, string> }> };

    // Filter items that match our TMDB ID
    const tmdbId = String(mediaRow.externalId);
    const matchingItems = searchData.Items.filter(item => {
      const providerTmdb = item.ProviderIds?.Tmdb ?? item.ProviderIds?.tmdb;
      return providerTmdb === tmdbId;
    });

    if (matchingItems.length >= 2) {
      const ids = matchingItems.map(i => i.Id).join(",");
      await fetch(`${JELLYFIN_URL_ENV}/Videos/MergeVersions?Ids=${ids}`, {
        method: "POST",
        headers: { "X-Emby-Token": JELLYFIN_API_KEY_ENV },
      });
      console.log(`[auto-import] Merged ${matchingItems.length} Jellyfin versions for "${mediaRow.title}"`);
    }
  } catch (err) {
    console.warn("[auto-import] Auto-merge failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Auto-import a completed torrent using qBittorrent's native API:
 * 1. setLocation — moves the torrent's files to the organized directory
 * 2. renameFile — renames each video file to Jellyfin naming convention
 * 3. Updates pre-associated media_file placeholders (created in download mutation)
 *
 * This means: zero duplication, qBit continues seeding from the new path,
 * and Jellyfin finds one clean file.
 */
async function autoImportTorrent(
  db: Database,
  torrentRow: typeof torrent.$inferSelect,
  qbClient: QBittorrentClient,
): Promise<void> {
  if (!torrentRow.hash || !torrentRow.mediaId) return;

  // Fetch linked media
  const mediaRow = await db.query.media.findFirst({
    where: eq(media.id, torrentRow.mediaId),
    with: { seasons: { with: { episodes: true } } },
  });
  if (!mediaRow) return;

  // Fetch pre-associated media_file placeholders
  const placeholders = await db.query.mediaFile.findMany({
    where: and(eq(mediaFile.torrentId, torrentRow.id), eq(mediaFile.status, "pending")),
  });

  // Determine container base path from library
  const libRow = mediaRow.libraryId
    ? await db.query.library.findFirst({ where: eq(library.id, mediaRow.libraryId) })
    : null;
  const containerBasePath = libRow?.containerMediaPath
    ?? (mediaRow.type === "show" ? "/medias/Shows" : "/medias/Movies");

  // Get torrent file list
  const files = await qbClient.getTorrentFiles(torrentRow.hash);
  const videoFiles = files.filter((f) => isVideoFile(f.name));
  if (videoFiles.length === 0) return;

  // Build Jellyfin-compatible directory name
  const safeTitle = sanitizeName(mediaRow.title);
  const yearSuffix = mediaRow.year ? ` (${mediaRow.year})` : "";
  const providerTag = mediaRow.provider === "tmdb" ? "tmdbid" : mediaRow.provider;
  const idTag = `[${providerTag}-${mediaRow.externalId}]`;
  const baseName = `${safeTitle}${yearSuffix} ${idTag}`;

  // Build quality+source label for filename: "[1080p WEB-DL]"
  const qualityLabel = (() => {
    switch (torrentRow.quality) {
      case "uhd": return "4K";
      case "fullhd": return "1080p";
      case "hd": return "720p";
      case "sd": return "SD";
      default: return "";
    }
  })();
  const sourceLabel = (() => {
    switch (torrentRow.source) {
      case "remux": return "Remux";
      case "bluray": return "Blu-Ray";
      case "webdl": return "WEB-DL";
      case "webrip": return "WEBRip";
      case "hdtv": return "HDTV";
      case "telesync": return "TS";
      case "cam": return "CAM";
      default: return "";
    }
  })();
  const versionTag = [qualityLabel, sourceLabel].filter(Boolean).join(" ");
  const versionSuffix = versionTag ? ` - [${versionTag}]` : "";

  // Determine the season for the target path
  let primarySeasonNumber = torrentRow.seasonNumber ?? undefined;
  if (!primarySeasonNumber && mediaRow.type === "show") {
    // Try to extract from the first video file name
    const match = EP_PATTERN.exec(videoFiles[0]?.name ?? "");
    if (match) primarySeasonNumber = parseInt(match[1]!, 10);
  }

  // Build target location (container path for qBit)
  const seasonPadded = String(primarySeasonNumber ?? 1).padStart(2, "0");
  const targetLocation = mediaRow.type === "movie"
    ? `${containerBasePath}/${baseName}`
    : `${containerBasePath}/${baseName}/Season ${seasonPadded}`;

  // Step 1: Move the torrent to the organized directory
  try {
    await qbClient.setLocation(torrentRow.hash, targetLocation);
    console.log(`[auto-import] Moved "${torrentRow.title}" → ${targetLocation}`);
  } catch (err) {
    console.error(`[auto-import] setLocation failed:`, err instanceof Error ? err.message : err);
    await db.update(torrent).set({ importing: false }).where(eq(torrent.id, torrentRow.id));
    return;
  }

  // Wait a moment for qBit to complete the move
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Step 2: Rename files and update media_file records
  let importedCount = 0;

  for (const vf of videoFiles) {
    try {
      let seasonNumber = primarySeasonNumber;
      let episodeId: string | undefined;
      const ext = vf.name.substring(vf.name.lastIndexOf("."));

      if (mediaRow.type === "show") {
        const match = EP_PATTERN.exec(vf.name);
        if (match) {
          seasonNumber = parseInt(match[1]!, 10);
          const epNum = parseInt(match[2]!, 10);
          const matchedSeason = mediaRow.seasons?.find((s) => s.number === seasonNumber);
          const matchedEp = matchedSeason?.episodes?.find((e) => e.number === epNum);
          if (matchedEp) episodeId = matchedEp.id;
        }
      }

      // Build new filename with version tag
      let targetFilename: string;
      if (mediaRow.type === "show" && seasonNumber !== undefined) {
        const match = EP_PATTERN.exec(vf.name);
        if (match) {
          const sn = String(parseInt(match[1]!, 10)).padStart(2, "0");
          const en = String(parseInt(match[2]!, 10)).padStart(2, "0");
          targetFilename = `S${sn}E${en}${versionSuffix}${ext}`;
        } else {
          targetFilename = sanitizeName(vf.name.substring(vf.name.lastIndexOf("/") + 1));
        }
      } else {
        targetFilename = `${safeTitle}${yearSuffix}${versionSuffix}${ext}`;
      }

      // Rename file via qBittorrent API
      if (vf.name !== targetFilename) {
        try {
          await qbClient.renameFile(torrentRow.hash, vf.name, targetFilename);
        } catch {
          console.warn(`[auto-import] renameFile failed for "${vf.name}", skipping rename`);
        }
      }

      // Build host path for DB using library paths
      const hostTargetLocation = (libRow?.mediaPath && libRow?.containerMediaPath)
        ? targetLocation.replace(libRow.containerMediaPath, libRow.mediaPath)
        : targetLocation.replace("/medias/", "/home/user/Medias/");
      const finalPath = `${hostTargetLocation}/${targetFilename}`;

      // UPDATE existing placeholder media_file (if we have one for this episode)
      // or CREATE a new one (for season packs where we might not have individual placeholders)
      if (episodeId) {
        const placeholder = placeholders.find(p => p.episodeId === episodeId);
        if (placeholder) {
          await db.update(mediaFile)
            .set({ filePath: finalPath, sizeBytes: vf.size, status: "imported" })
            .where(eq(mediaFile.id, placeholder.id));
          importedCount++;
        } else {
          // Create new record (file matched an episode we didn't pre-associate)
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
        const placeholder = placeholders.find(p => !p.episodeId);
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

  // Build host content path for DB
  const hostContentPath = (libRow?.mediaPath && libRow?.containerMediaPath)
    ? targetLocation.replace(libRow.containerMediaPath, libRow.mediaPath)
    : targetLocation.replace("/medias/", "/home/user/Medias/");

  // Mark torrent as imported
  await db.update(torrent).set({
    imported: true,
    importing: false,
    contentPath: hostContentPath,
    updatedAt: new Date(),
  }).where(eq(torrent.id, torrentRow.id));

  if (importedCount > 0) {
    console.log(`[auto-import] Imported ${importedCount} file(s) for "${mediaRow.title}"`);
    await triggerMediaServerScans(db, mediaRow.libraryId ?? undefined);

    // Auto-merge versions if enabled
    await autoMergeIfEnabled(db, mediaRow, torrentRow);
  }
}

/* -------------------------------------------------------------------------- */
/*  Prowlarr API Client                                                       */
/* -------------------------------------------------------------------------- */

interface ProwlarrResult {
  guid: string;
  title: string;
  size: number;
  publishDate: string;
  downloadUrl: string | null;
  magnetUrl: string | null;
  infoUrl: string | null;
  indexer: string;
  seeders: number;
  leechers: number;
  age: number;
  indexerFlags: string[];
  categories: Array<{ id: number; name: string }>;
}

class ProwlarrClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== "placeholder" && this.apiKey !== "your_prowlarr_api_key_here";
  }

  async search(query: string): Promise<ProwlarrResult[]> {
    const url = new URL(`${this.baseUrl}/api/v1/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("type", "search");

    const response = await fetch(url.toString(), {
      headers: {
        "X-Api-Key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Prowlarr search failed: ${response.status} ${text}`);
    }

    return response.json() as Promise<ProwlarrResult[]>;
  }
}

/* -------------------------------------------------------------------------- */
/*  Singletons                                                                */
/* -------------------------------------------------------------------------- */

let qbClient: QBittorrentClient | null = null;
async function getQBClient(): Promise<QBittorrentClient> {
  if (!qbClient) {
    const url = (await getSetting("qbittorrent.url")) ?? "";
    const user = (await getSetting("qbittorrent.username")) ?? "";
    const pass = (await getSetting("qbittorrent.password")) ?? "";
    qbClient = new QBittorrentClient(url, user, pass);
  }
  return qbClient;
}

/** Reset the cached client (e.g. after settings change) */
export function resetQBClient(): void {
  qbClient = null;
}

let prowlarrClient: ProwlarrClient | null = null;
async function getProwlarrClient(): Promise<ProwlarrClient> {
  if (!prowlarrClient) {
    const url = (await getSetting("prowlarr.url")) ?? "";
    const apiKey = (await getSetting("prowlarr.apiKey")) ?? "";
    prowlarrClient = new ProwlarrClient(url, apiKey);
  }
  return prowlarrClient;
}

export function resetProwlarrClient(): void {
  prowlarrClient = null;
}

/* -------------------------------------------------------------------------- */
/*  Quality detection                                                         */
/* -------------------------------------------------------------------------- */

function detectQuality(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("2160p") || lower.includes("4k") || lower.includes("uhd"))
    return "uhd";
  if (lower.includes("1080p") || lower.includes("fullhd")) return "fullhd";
  if (lower.includes("720p")) return "hd";
  if (lower.includes("480p") || lower.includes("360p")) return "sd";
  return "unknown";
}

function detectSource(title: string): string {
  const lower = title.toLowerCase();
  if (/\bremux\b/.test(lower)) return "remux";
  if (/\b(blu[\s.-]?ray|bdrip|brrip)\b/.test(lower)) return "bluray";
  if (/\bweb[\s.-]?dl\b/.test(lower)) return "webdl";
  if (/\bwebrip\b/.test(lower)) return "webrip";
  if (/\b(hdtv|pdtv|dsr)\b/.test(lower)) return "hdtv";
  if (/\b(telesync|hdts|ts(?:rip)?)\b/.test(lower)) return "telesync";
  if (/\b(cam|hdcam|camrip)\b/.test(lower)) return "cam";
  return "unknown";
}

const CAM_KEYWORDS = [
  "cam", "camrip", "bdscr", "ddc", "dvdscreener", "dvdscr",
  "hdcam", "hdtc", "hdts", "scr", "screener", "telesync",
  "ts", "webscreener", "tc", "telecine", "tvrip",
];

interface ConfidenceContext {
  hasDigitalRelease: boolean;
}

/**
 * Calculate a confidence score 0–100 for a torrent result.
 *
 * Breakdown:
 *   Health   0–40  (seeders on a log scale)
 *   Quality  0–30  (detected resolution)
 *   Encoding 0–15  (codec efficiency)
 *   Fresh    0–10  (how recent the upload is)
 *   Bonus    0–5   (freeleech, etc.)
 *   Penalties       (cam/nuked reduce the total)
 */
function calculateConfidence(
  title: string,
  quality: string,
  flags: string[],
  seeders: number,
  age: number,
  ctx: ConfidenceContext,
): number {
  const lower = title.toLowerCase();
  let score = 0;

  // ── Health (0–40) — log-scale seeders ──
  if (seeders >= 500) score += 40;
  else if (seeders >= 100) score += 35;
  else if (seeders >= 50) score += 30;
  else if (seeders >= 20) score += 25;
  else if (seeders >= 10) score += 20;
  else if (seeders >= 5) score += 15;
  else if (seeders >= 1) score += 8;
  // 0 seeders = 0

  // ── Quality (0–30) ──
  switch (quality) {
    case "uhd":    score += 30; break;
    case "fullhd": score += 25; break;
    case "hd":     score += 15; break;
    case "sd":     score += 5;  break;
    // unknown = 0
  }

  // ── Encoding (0–15) ──
  if (/\b(h\.?265|hevc|x\.?265)\b/i.test(lower)) score += 15;
  else if (/\b(h\.?264|x\.?264|avc)\b/i.test(lower)) score += 8;

  // ── Source (−40 to +15) ──
  const source = detectSource(title);
  switch (source) {
    case "remux": score += 15; break;
    case "bluray": score += 12; break;
    case "webdl": score += 10; break;
    case "webrip": score += 7; break;
    case "hdtv": score += 5; break;
    case "telesync": score -= 20; break;
    case "cam": score -= 40; break;
  }

  // ── Freshness (0–10) — newer uploads = better ──
  if (age <= 1) score += 10;
  else if (age <= 7) score += 8;
  else if (age <= 30) score += 5;
  else if (age <= 90) score += 3;
  else if (age <= 365) score += 1;

  // ── Bonus (0–5) ──
  const lowerFlags = flags.map((f) => f.toLowerCase());
  if (lowerFlags.includes("freeleech") || lowerFlags.includes("freeleech75")) {
    score += 5;
  }

  // ── Penalties ──
  // CAM/screener: only penalize hard if digital release exists.
  // If still in theaters, CAM is expected — light penalty instead.
  let isCam = false;
  for (const kw of CAM_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(lower)) {
      isCam = true;
      break;
    }
  }
  if (isCam) {
    score -= ctx.hasDigitalRelease ? 80 : 15;
  }

  // Nuked = always reject
  if (lowerFlags.includes("nuked")) score -= 100;

  // Normalize to 0–100 (max raw score is 115 with source bonus)
  const MAX_RAW = 115;
  const normalized = Math.round((score / MAX_RAW) * 100);
  return Math.max(0, Math.min(100, normalized));
}

/* -------------------------------------------------------------------------- */
/*  Season / Episode parsing                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Parse season numbers from torrent title.
 * "Show S01E01" -> [1]
 * "Show S01-S03" -> [1, 2, 3]
 * "Show S01" -> [1]
 * "Show Season 1" -> [1]
 */
function parseSeasons(title: string): number[] {
  const lower = title.toLowerCase();

  // S01E01 pattern -> single season
  const seMatch = /s(\d{1,2})e\d{1,3}/i.exec(lower);
  if (seMatch) return [parseInt(seMatch[1]!, 10)];

  // S01-S03 range
  const rangeMatch = /s(\d{1,2})\s*[-–]\s*s?(\d{1,2})/i.exec(lower);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]!, 10);
    const end = parseInt(rangeMatch[2]!, 10);
    if (start <= end) {
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
    return [];
  }

  // S01 pack
  const packMatch = /\bs(\d{1,2})\b/i.exec(lower);
  if (packMatch) return [parseInt(packMatch[1]!, 10)];

  // "Season 1"
  const wordMatch = /\bseason\s*(\d{1,2})\b/i.exec(lower);
  if (wordMatch) return [parseInt(wordMatch[1]!, 10)];

  return [];
}

/**
 * Parse episode numbers from torrent title.
 * "Show S01E01" -> [1]
 * "Show S01E01-E05" -> [1, 2, 3, 4, 5]
 * "Show S01E01E02E03" -> [1, 2, 3]
 * "Show S01" -> [] (season pack, all episodes)
 */
function parseEpisodes(title: string): number[] {
  const lower = title.toLowerCase();

  // Multi-episode: S01E01E02E03
  const multiMatch = lower.match(/s\d{1,2}((?:e\d{1,3})+)/i);
  if (multiMatch) {
    const epPart = multiMatch[1]!;
    const eps = [...epPart.matchAll(/e(\d{1,3})/gi)].map((m) =>
      parseInt(m[1]!, 10),
    );
    if (eps.length > 1) return eps;
  }

  // Range: S01E01-E05 or S01E01-05
  const rangeMatch = /s\d{1,2}e(\d{1,3})\s*[-–]\s*e?(\d{1,3})/i.exec(lower);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1]!, 10);
    const end = parseInt(rangeMatch[2]!, 10);
    if (end >= start) {
      return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }
  }

  // Single: S01E01
  const singleMatch = /s\d{1,2}e(\d{1,3})/i.exec(lower);
  if (singleMatch) return [parseInt(singleMatch[1]!, 10)];

  // No episode pattern = season pack
  return [];
}

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const torrentRouter = createTRPCRouter({
  /**
   * Search for torrents via Prowlarr, building a search query from the
   * media item's title (+ season number if provided).
   */
  search: publicProcedure // TODO: protectedProcedure when auth ready
    .input(torrentSearchInput)
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.mediaId),
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media not found",
        });
      }

      // Build search query
      let query = row.title;
      if (input.seasonNumber !== undefined) {
        const paddedSeason = String(input.seasonNumber).padStart(2, "0");
        if (
          input.episodeNumbers &&
          input.episodeNumbers.length === 1 &&
          input.episodeNumbers[0] !== undefined
        ) {
          // Single episode: use S01E01 format
          const paddedEp = String(input.episodeNumbers[0]).padStart(2, "0");
          query += ` S${paddedSeason}E${paddedEp}`;
        } else {
          // Multiple episodes or no episodes: use season pack query
          query += ` S${paddedSeason}`;
        }
      }

      const prowlarr = await getProwlarrClient();

      // Check if Prowlarr is configured
      if (!prowlarr.isConfigured()) {
        return [];
      }

      let results: ProwlarrResult[];
      try {
        results = await prowlarr.search(query);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Indexer search failed: ${message}`,
        });
      }

      // Determine if media has a digital release (not just in theaters)
      // A movie released > 3 months ago, or with status "Released", or a show,
      // is considered to have a digital release available.
      const isShow = row.type === "show";
      const releaseDate = row.releaseDate ? new Date(row.releaseDate) : null;
      const monthsSinceRelease = releaseDate
        ? (Date.now() - releaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
        : Infinity;
      const hasDigitalRelease = isShow || monthsSinceRelease > 3;

      const confidenceCtx: ConfidenceContext = { hasDigitalRelease };

      return results
        .map((r) => {
          const flags = r.indexerFlags ?? [];
          const quality = detectQuality(r.title);
          const confidence = calculateConfidence(
            r.title, quality, flags, r.seeders, r.age ?? 0, confidenceCtx,
          );
          return {
            guid: r.guid,
            title: r.title,
            size: r.size,
            publishDate: r.publishDate,
            downloadUrl: r.downloadUrl,
            magnetUrl: r.magnetUrl,
            infoUrl: r.infoUrl,
            indexer: r.indexer,
            seeders: r.seeders,
            leechers: r.leechers,
            age: r.age ?? 0,
            flags,
            quality,
            source: detectSource(r.title),
            confidence,
            categories: r.categories,
          };
        })
        .filter((r) => r.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence);
    }),

  /**
   * Send a magnet/torrent URL to qBittorrent and create a torrent DB record.
   * Pre-associates media_file placeholders so we know what episodes are
   * covered BEFORE the download completes.
   */
  download: publicProcedure
    .input(torrentDownloadInput)
    .mutation(async ({ ctx, input }) => {
      const magnetOrUrl = input.magnetUrl ?? input.torrentUrl;

      if (!magnetOrUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either magnetUrl or downloadUrl must be provided",
        });
      }

      // ── Fetch media with seasons/episodes for association ──

      const mediaRow = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.mediaId),
        with: { seasons: { with: { episodes: true } } },
      });

      if (!mediaRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      }

      // ── Resolve qBittorrent category from library assignment ──

      let qbCategory: string;
      if (mediaRow.libraryId) {
        const assignedLib = await ctx.db.query.library.findFirst({
          where: eq(library.id, mediaRow.libraryId),
          columns: { qbitCategory: true },
        });
        qbCategory = assignedLib?.qbitCategory ?? (mediaRow.type === "show" ? "shows" : "movies");
      } else {
        const mediaType = mediaRow.type === "show" ? "shows" : "movies";
        const defaultLib = await ctx.db.query.library.findFirst({
          where: and(eq(library.type, mediaType), eq(library.isDefault, true)),
          columns: { qbitCategory: true },
        });
        qbCategory = defaultLib?.qbitCategory ?? mediaType;
      }

      // ── Deduplication: check if we already have this torrent (by title) ──

      const existingByTitle = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.title, input.title),
      });

      if (existingByTitle) {
        const qb = await getQBClient();

        if (existingByTitle.hash) {
          try {
            await qb.setCategory(existingByTitle.hash, qbCategory);
          } catch {
            // Best effort
          }
        }

        if (existingByTitle.status === "completed") {
          return existingByTitle;
        }

        if (existingByTitle.status === "paused" && existingByTitle.hash) {
          await qb.resumeTorrent(existingByTitle.hash);
          const [updated] = await ctx.db
            .update(torrent)
            .set({ status: "downloading", updatedAt: new Date() })
            .where(eq(torrent.id, existingByTitle.id))
            .returning();
          return updated!;
        }

        if (["incomplete", "removed", "error"].includes(existingByTitle.status)) {
          await qb.addTorrent(magnetOrUrl, qbCategory);

          let hash = existingByTitle.hash;
          if (!hash && magnetOrUrl.startsWith("magnet:")) {
            const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(magnetOrUrl);
            if (match?.[1]) hash = match[1].toLowerCase();
          }

          const [updated] = await ctx.db
            .update(torrent)
            .set({
              hash: hash ?? existingByTitle.hash,
              status: "downloading",
              progress: 0,
              magnetUrl: input.magnetUrl ?? existingByTitle.magnetUrl,
              downloadUrl: input.torrentUrl ?? existingByTitle.downloadUrl,
              updatedAt: new Date(),
            })
            .where(eq(torrent.id, existingByTitle.id))
            .returning();
          return updated!;
        }

        if (existingByTitle.status === "downloading") {
          return existingByTitle;
        }
      }

      // ── Detect quality and source from title ──

      const quality = detectQuality(input.title);
      const source = detectSource(input.title);

      // ── Determine download type and resolve episode IDs for shows ──

      const parsedSeasons = input.seasonNumber != null ? [input.seasonNumber] : parseSeasons(input.title);
      const parsedEpisodes = input.episodeNumbers ?? parseEpisodes(input.title);

      const torrentType = mediaRow.type === "movie"
        ? "movie"
        : (parsedEpisodes.length > 0 ? "episode" : "season");

      let episodeIds: Array<{ id: string; seasonNumber: number; episodeNumber: number }> = [];

      if (mediaRow.type === "show") {
        for (const seasonNum of parsedSeasons) {
          const seasonRow = mediaRow.seasons?.find((s) => s.number === seasonNum);
          if (!seasonRow?.episodes) continue;

          if (parsedEpisodes.length > 0) {
            // Specific episodes
            for (const epNum of parsedEpisodes) {
              const ep = seasonRow.episodes.find((e) => e.number === epNum);
              if (ep) episodeIds.push({ id: ep.id, seasonNumber: seasonNum, episodeNumber: epNum });
            }
          } else {
            // Season pack — all episodes from that season
            for (const ep of seasonRow.episodes) {
              episodeIds.push({ id: ep.id, seasonNumber: seasonNum, episodeNumber: ep.number });
            }
          }
        }
      }

      // ── Check for duplicate files ──

      const duplicates: string[] = [];

      if (mediaRow.type === "movie") {
        const existingFile = await ctx.db.query.mediaFile.findFirst({
          where: and(
            eq(mediaFile.mediaId, input.mediaId),
            eq(mediaFile.quality, quality),
            eq(mediaFile.source, source),
            isNull(mediaFile.episodeId),
          ),
        });
        if (existingFile) duplicates.push(`${mediaRow.title} (${quality} ${source})`);
      } else {
        for (const ep of episodeIds) {
          const existingFile = await ctx.db.query.mediaFile.findFirst({
            where: and(
              eq(mediaFile.episodeId, ep.id),
              eq(mediaFile.quality, quality),
              eq(mediaFile.source, source),
            ),
          });
          if (existingFile) {
            duplicates.push(
              `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`,
            );
          }
        }
      }

      if (duplicates.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Already downloaded in ${quality} ${source}: ${duplicates.join(", ")}`,
        });
      }

      // ── Extract hash from magnet link ──

      let extractedHash: string | undefined;
      if (magnetOrUrl.startsWith("magnet:")) {
        const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(magnetOrUrl);
        if (match?.[1]) extractedHash = match[1].toLowerCase();
      }

      // ── Dedup by hash ──

      if (extractedHash) {
        const byHash = await ctx.db.query.torrent.findFirst({
          where: eq(torrent.hash, extractedHash),
        });
        if (byHash) {
          const [updated] = await ctx.db
            .update(torrent)
            .set({
              status: "downloading",
              progress: 0,
              mediaId: input.mediaId,
              magnetUrl: input.magnetUrl ?? byHash.magnetUrl,
              downloadUrl: input.torrentUrl ?? byHash.downloadUrl,
              updatedAt: new Date(),
            })
            .where(eq(torrent.id, byHash.id))
            .returning();
          return updated!;
        }
      }

      // ── Create torrent record ──

      const [torrentRow] = await ctx.db
        .insert(torrent)
        .values({
          mediaId: input.mediaId,
          title: input.title,
          hash: extractedHash ?? null,
          magnetUrl: input.magnetUrl ?? null,
          downloadUrl: input.torrentUrl ?? null,
          quality,
          source,
          downloadType: torrentType,
          seasonNumber: input.seasonNumber ?? parsedSeasons[0] ?? null,
          episodeNumbers: input.episodeNumbers ?? (parsedEpisodes.length > 0 ? parsedEpisodes : null),
          status: "downloading",
        })
        .returning();

      if (!torrentRow) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create torrent" });
      }

      // ── Create placeholder media_file records ──

      try {
        if (mediaRow.type === "movie") {
          await ctx.db.insert(mediaFile).values({
            mediaId: input.mediaId,
            episodeId: null,
            torrentId: torrentRow.id,
            filePath: "",
            quality,
            source,
            status: "pending",
          });
        } else {
          for (const ep of episodeIds) {
            await ctx.db.insert(mediaFile).values({
              mediaId: input.mediaId,
              episodeId: ep.id,
              torrentId: torrentRow.id,
              filePath: "",
              quality,
              source,
              status: "pending",
            });
          }
        }
      } catch {
        // Rollback on constraint violation
        await ctx.db.delete(mediaFile).where(eq(mediaFile.torrentId, torrentRow.id));
        await ctx.db.delete(torrent).where(eq(torrent.id, torrentRow.id));
        throw new TRPCError({
          code: "CONFLICT",
          message: "Duplicate file version detected",
        });
      }

      // ── Add to qBittorrent ──

      const qb = await getQBClient();

      try {
        // Snapshot existing hashes before adding
        let existingHashes: Set<string>;
        try {
          const live = await qb.listTorrents();
          existingHashes = new Set(live.map((t) => t.hash));
        } catch {
          existingHashes = new Set();
        }

        await qb.addTorrent(magnetOrUrl, qbCategory);

        // If no hash from magnet, poll qBittorrent for the new torrent
        if (!extractedHash) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          try {
            const current = await qb.listTorrents();
            const newTorrent = current.find((t) => !existingHashes.has(t.hash));
            if (newTorrent) {
              extractedHash = newTorrent.hash;
              await ctx.db
                .update(torrent)
                .set({ hash: extractedHash, updatedAt: new Date() })
                .where(eq(torrent.id, torrentRow.id));
            }
          } catch {
            // Best effort
          }
        }
      } catch (qbErr) {
        // qBittorrent failed — rollback DB records
        await ctx.db.delete(mediaFile).where(eq(mediaFile.torrentId, torrentRow.id));
        await ctx.db.delete(torrent).where(eq(torrent.id, torrentRow.id));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to add torrent to qBittorrent: ${qbErr instanceof Error ? qbErr.message : "Unknown error"}`,
        });
      }

      return torrentRow;
    }),

  /**
   * Replace existing media_file records and re-download with a new torrent.
   * Deletes the specified old files, then runs the standard download flow.
   */
  replace: publicProcedure
    .input(
      z.object({
        replaceFileIds: z.array(z.string().uuid()),
        mediaId: z.string().uuid(),
        title: z.string().min(1),
        magnetUrl: z.string().url().optional(),
        torrentUrl: z.string().url().optional(),
        seasonNumber: z.number().int().nonnegative().optional(),
        episodeNumbers: z.array(z.number().int().positive()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Delete old media_file records
      for (const fileId of input.replaceFileIds) {
        await ctx.db.delete(mediaFile).where(eq(mediaFile.id, fileId));
      }

      // Re-use the download logic by calling directly into the router
      // We build the same input shape and delegate
      const magnetOrUrl = input.magnetUrl ?? input.torrentUrl;

      if (!magnetOrUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either magnetUrl or torrentUrl must be provided",
        });
      }

      // ── Fetch media with seasons/episodes ──

      const mediaRow = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.mediaId),
        with: { seasons: { with: { episodes: true } } },
      });

      if (!mediaRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      }

      // ── Resolve qBittorrent category ──

      let qbCategory: string;
      if (mediaRow.libraryId) {
        const assignedLib = await ctx.db.query.library.findFirst({
          where: eq(library.id, mediaRow.libraryId),
          columns: { qbitCategory: true },
        });
        qbCategory = assignedLib?.qbitCategory ?? (mediaRow.type === "show" ? "shows" : "movies");
      } else {
        const mediaType = mediaRow.type === "show" ? "shows" : "movies";
        const defaultLib = await ctx.db.query.library.findFirst({
          where: and(eq(library.type, mediaType), eq(library.isDefault, true)),
          columns: { qbitCategory: true },
        });
        qbCategory = defaultLib?.qbitCategory ?? mediaType;
      }

      // ── Detect quality / source ──

      const quality = detectQuality(input.title);
      const source = detectSource(input.title);

      // ── Resolve episodes ──

      const parsedSeasons = input.seasonNumber != null ? [input.seasonNumber] : parseSeasons(input.title);
      const parsedEpisodes = input.episodeNumbers ?? parseEpisodes(input.title);

      const torrentType = mediaRow.type === "movie"
        ? "movie"
        : (parsedEpisodes.length > 0 ? "episode" : "season");

      let episodeIds: Array<{ id: string; seasonNumber: number; episodeNumber: number }> = [];

      if (mediaRow.type === "show") {
        for (const seasonNum of parsedSeasons) {
          const seasonRow = mediaRow.seasons?.find((s) => s.number === seasonNum);
          if (!seasonRow?.episodes) continue;

          if (parsedEpisodes.length > 0) {
            for (const epNum of parsedEpisodes) {
              const ep = seasonRow.episodes.find((e) => e.number === epNum);
              if (ep) episodeIds.push({ id: ep.id, seasonNumber: seasonNum, episodeNumber: epNum });
            }
          } else {
            for (const ep of seasonRow.episodes) {
              episodeIds.push({ id: ep.id, seasonNumber: seasonNum, episodeNumber: ep.number });
            }
          }
        }
      }

      // ── Extract hash ──

      let extractedHash: string | undefined;
      if (magnetOrUrl.startsWith("magnet:")) {
        const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(magnetOrUrl);
        if (match?.[1]) extractedHash = match[1].toLowerCase();
      }

      // ── Create torrent record ──

      const [torrentRow] = await ctx.db
        .insert(torrent)
        .values({
          mediaId: input.mediaId,
          title: input.title,
          hash: extractedHash ?? null,
          magnetUrl: input.magnetUrl ?? null,
          downloadUrl: input.torrentUrl ?? null,
          quality,
          source,
          downloadType: torrentType,
          seasonNumber: input.seasonNumber ?? parsedSeasons[0] ?? null,
          episodeNumbers: input.episodeNumbers ?? (parsedEpisodes.length > 0 ? parsedEpisodes : null),
          status: "downloading",
        })
        .returning();

      if (!torrentRow) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create torrent" });
      }

      // ── Create placeholder media_file records ──

      if (mediaRow.type === "movie") {
        await ctx.db.insert(mediaFile).values({
          mediaId: input.mediaId,
          episodeId: null,
          torrentId: torrentRow.id,
          filePath: "",
          quality,
          source,
          status: "pending",
        });
      } else {
        for (const ep of episodeIds) {
          await ctx.db.insert(mediaFile).values({
            mediaId: input.mediaId,
            episodeId: ep.id,
            torrentId: torrentRow.id,
            filePath: "",
            quality,
            source,
            status: "pending",
          });
        }
      }

      // ── Add to qBittorrent ──

      const qb = await getQBClient();

      try {
        await qb.addTorrent(magnetOrUrl, qbCategory);

        if (!extractedHash) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          try {
            const current = await qb.listTorrents();
            // Find newest torrent as a fallback for hash
            const sorted = [...current].sort((a, b) => b.added_on - a.added_on);
            if (sorted[0]) {
              extractedHash = sorted[0].hash;
              await ctx.db
                .update(torrent)
                .set({ hash: extractedHash, updatedAt: new Date() })
                .where(eq(torrent.id, torrentRow.id));
            }
          } catch {
            // Best effort
          }
        }
      } catch (qbErr) {
        // Rollback
        await ctx.db.delete(mediaFile).where(eq(mediaFile.torrentId, torrentRow.id));
        await ctx.db.delete(torrent).where(eq(torrent.id, torrentRow.id));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to add torrent to qBittorrent: ${qbErr instanceof Error ? qbErr.message : "Unknown error"}`,
        });
      }

      return torrentRow;
    }),

  /**
   * Re-download a torrent that was removed or errored.
   */
  retry: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      }

      const url = row.magnetUrl ?? row.downloadUrl;
      if (!url) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No download URL saved for this torrent. Please search and download again.",
        });
      }

      // Resolve category from linked media's library assignment
      const linkedMedia = row.mediaId
        ? await ctx.db.query.media.findFirst({
            where: eq(media.id, row.mediaId),
            columns: { type: true, libraryId: true },
          })
        : null;

      let retryCategory: string;
      if (linkedMedia?.libraryId) {
        const assignedLib = await ctx.db.query.library.findFirst({
          where: eq(library.id, linkedMedia.libraryId),
          columns: { qbitCategory: true },
        });
        retryCategory = assignedLib?.qbitCategory ?? (linkedMedia.type === "show" ? "shows" : "movies");
      } else {
        const mediaType = linkedMedia?.type === "show" ? "shows" : "movies";
        const defaultLib = await ctx.db.query.library.findFirst({
          where: and(eq(library.type, mediaType), eq(library.isDefault, true)),
          columns: { qbitCategory: true },
        });
        retryCategory = defaultLib?.qbitCategory ?? mediaType;
      }

      const qb = await getQBClient();
      await qb.addTorrent(url, retryCategory);

      // Try to get the new hash
      let newHash = row.hash;
      if (!newHash && url.startsWith("magnet:")) {
        const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(url);
        if (match?.[1]) newHash = match[1].toLowerCase();
      }

      const [updated] = await ctx.db
        .update(torrent)
        .set({
          hash: newHash,
          status: "downloading",
          progress: 0,
          updatedAt: new Date(),
        })
        .where(eq(torrent.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * List all torrent records from the database.
   */
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.torrent.findMany({
      orderBy: (t, { desc: d }) => [d(t.createdAt)],
    });
  }),

  /**
   * List torrents for a specific media item.
   */
  listByMedia: publicProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.torrent.findMany({
        where: eq(torrent.mediaId, input.mediaId),
        orderBy: (t, { desc: d }) => [d(t.createdAt)],
      });
    }),

  /**
   * List live torrent data from qBittorrent merged with DB records + media info.
   */
  listLive: publicProcedure.query(async ({ ctx }) => {
    const dbRows = await ctx.db.query.torrent.findMany({
      orderBy: (t, { desc: d }) => [d(t.createdAt)],
    });

    // Fetch media info for all linked torrents
    const mediaIds = [...new Set(dbRows.map((r) => r.mediaId).filter(Boolean))] as string[];
    const mediaRows = mediaIds.length > 0
      ? await ctx.db.query.media.findMany({
          columns: { id: true, title: true, posterPath: true, type: true, year: true },
        })
      : [];
    const mediaMap = new Map(mediaRows.map((m) => [m.id, m]));

    let liveTorrents: Array<{
      hash: string;
      name: string;
      state: string;
      progress: number;
      size: number;
      dlspeed: number;
      upspeed: number;
      eta: number;
      num_seeds: number;
      num_leechs: number;
      added_on: number;
      completion_on: number;
      ratio: number;
      content_path: string;
      save_path: string;
    }> = [];
    let qbReachable = false;
    const qbImportClient = await getQBClient();

    try {
      liveTorrents = await qbImportClient.listTorrents();
      qbReachable = true;
    } catch {
      // qBittorrent may be unreachable — return DB data only
    }

    const liveMap = new Map(liveTorrents.map((t) => [t.hash, t]));

    // ── Sync state from qBittorrent → DB ──

    // 1. Persist contentPath, fileSize, and progress from live data
    for (const row of dbRows) {
      const live = row.hash ? liveMap.get(row.hash) : undefined;
      if (live) {
        const updates: Record<string, unknown> = {
          progress: live.progress,
          updatedAt: new Date(),
        };
        if (live.content_path && !row.contentPath) {
          updates.contentPath = live.content_path;
          (row as { contentPath: string | null }).contentPath = live.content_path;
        }
        if (live.size && !row.fileSize) {
          updates.fileSize = live.size;
          (row as { fileSize: number | null }).fileSize = live.size;
        }
        (row as { progress: number }).progress = live.progress;
        void ctx.db
          .update(torrent)
          .set(updates)
          .where(eq(torrent.id, row.id))
          .execute()
          .catch(() => {});
      }
    }

    // 2. Status transitions based on live data
    const statusUpdates = new Map<string, string>(); // id → new status

    for (const row of dbRows) {
      const live = row.hash ? liveMap.get(row.hash) : undefined;

      if (live && live.progress >= 1 && row.status !== "completed") {
        statusUpdates.set(row.id, "completed");
      } else if (
        !live &&
        row.hash &&
        qbReachable &&
        (row.status === "downloading" || row.status === "paused")
      ) {
        // Disappeared from qBittorrent
        if (row.progress >= 1) {
          statusUpdates.set(row.id, "completed");
        } else {
          statusUpdates.set(row.id, "incomplete");
        }
      }
    }

    // Batch by target status
    const byStatus = new Map<string, string[]>();
    for (const [id, status] of statusUpdates) {
      if (!byStatus.has(status)) byStatus.set(status, []);
      byStatus.get(status)!.push(id);
    }
    for (const [status, ids] of byStatus) {
      void ctx.db
        .update(torrent)
        .set({ status, updatedAt: new Date() })
        .where(inArray(torrent.id, ids))
        .execute()
        .catch(() => {});
    }
    // Auto-import: trigger for newly completed, non-imported torrents
    const newlyCompleted = [...statusUpdates.entries()]
      .filter(([, s]) => s === "completed")
      .map(([id]) => id);

    if (newlyCompleted.length > 0) {
      const toImport = dbRows.filter(
        (r) => newlyCompleted.includes(r.id) && !r.imported && !r.importing && r.hash && r.mediaId,
      );
      if (toImport.length > 0) {
        // Atomically claim: UPDATE ... WHERE importing = false RETURNING *
        for (const row of toImport) {
          void (async () => {
            try {
              // Atomically set importing = true (prevents double-import from concurrent listLive calls)
              const [claimed] = await ctx.db
                .update(torrent)
                .set({ importing: true })
                .where(and(eq(torrent.id, row.id), eq(torrent.importing, false)))
                .returning();

              if (!claimed) return; // Another process already claimed it

              await autoImportTorrent(ctx.db, claimed, qbImportClient);
            } catch (err) {
              console.error(`[auto-import] Failed for "${row.title}":`, err instanceof Error ? err.message : err);
              // Reset importing flag so it can retry
              await ctx.db.update(torrent).set({ importing: false }).where(eq(torrent.id, row.id)).catch(() => {});
            }
          })();
        }
      }
    }

    // Update in-memory
    for (const row of dbRows) {
      const newStatus = statusUpdates.get(row.id);
      if (newStatus) (row as { status: string }).status = newStatus;
    }

    return dbRows.map((row) => {
      const live = row.hash ? liveMap.get(row.hash) : undefined;
      const linkedMedia = row.mediaId ? mediaMap.get(row.mediaId) : undefined;
      return {
        ...row,
        media: linkedMedia
          ? {
              id: linkedMedia.id,
              title: linkedMedia.title,
              posterPath: linkedMedia.posterPath,
              type: linkedMedia.type,
              year: linkedMedia.year,
            }
          : null,
        live: live
          ? {
              state: live.state,
              progress: live.progress,
              size: live.size,
              dlspeed: live.dlspeed,
              upspeed: live.upspeed,
              eta: live.eta,
              seeds: live.num_seeds,
              peers: live.num_leechs,
              addedOn: live.added_on,
              completedOn: live.completion_on,
              ratio: live.ratio,
            }
          : null,
      };
    });
  }),

  /**
   * Pause a torrent in qBittorrent.
   */
  pause: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      }

      if (row.hash) {
        const qb = await getQBClient();
        await qb.pauseTorrent(row.hash);
      }

      const [updated] = await ctx.db
        .update(torrent)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(torrent.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Resume a paused torrent in qBittorrent.
   */
  resume: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      }

      if (row.hash) {
        const qb = await getQBClient();
        await qb.resumeTorrent(row.hash);
      }

      const [updated] = await ctx.db
        .update(torrent)
        .set({ status: "downloading", updatedAt: new Date() })
        .where(eq(torrent.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Cancel (pause) a torrent in qBittorrent (legacy).
   */
  cancel: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      }

      if (row.hash) {
        const qb = await getQBClient();
        await qb.pauseTorrent(row.hash);
      }

      const [updated] = await ctx.db
        .update(torrent)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(torrent.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Trigger import for a completed torrent — organizes files and triggers Jellyfin scan.
   */
  import: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      }

      if (row.imported) {
        return { success: true, message: "Already imported" };
      }

      if (row.importing) {
        return { success: true, message: "Import already in progress" };
      }

      if (row.status !== "completed" || !row.hash || !row.mediaId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Torrent must be completed and linked to a media item to import",
        });
      }

      // Atomically set importing = true
      const [claimed] = await ctx.db
        .update(torrent)
        .set({ importing: true })
        .where(and(eq(torrent.id, row.id), eq(torrent.importing, false)))
        .returning();

      if (!claimed) {
        return { success: true, message: "Import already in progress" };
      }

      try {
        const qb = await getQBClient();
        await autoImportTorrent(ctx.db, claimed, qb);
        return { success: true };
      } catch (err) {
        // Reset importing flag so it can retry
        await ctx.db.update(torrent).set({ importing: false }).where(eq(torrent.id, row.id));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Import failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Delete a torrent record from DB and optionally from qBittorrent.
   */
  delete: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        deleteFiles: z.boolean().default(false),
        removeTorrent: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Torrent not found",
        });
      }

      // Remove from qBittorrent if requested and hash is known
      if (input.removeTorrent && row.hash) {
        try {
          const qb = await getQBClient();
          await qb.deleteTorrent(row.hash, input.deleteFiles);
        } catch {
          // qBittorrent may not have this torrent anymore — that is okay
        }
      }

      await ctx.db.delete(torrent).where(eq(torrent.id, input.id));

      return { success: true };
    }),
});
