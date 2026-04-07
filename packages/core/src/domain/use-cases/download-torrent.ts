import { TRPCError } from "@trpc/server";

import type { Database } from "@canto/db/client";
import type { TorrentDownloadInput } from "@canto/validators";

import { logAndSwallow } from "../../lib/log-error";
import { resolveDownloadUrl } from "../../lib/follow-redirects";
import { detectQuality, detectSource } from "../rules/quality";
import { parseSeasons, parseEpisodes } from "../rules/parsing";
import type { DownloadClientPort } from "../ports/download-client";
import {
  findMediaByIdWithSeasons,
  findFolderById,
  findAllFolders,
  findDefaultFolder,
  findTorrentByTitle,
  findTorrentByHash,
  createTorrent,
  updateTorrent,
  deleteTorrent,
  createMediaFile,
  deleteMediaFile,
  deleteMediaFilesByTorrentId,
  findDuplicateMovieFile,
  findDuplicateEpisodeFile,
  findBlocklistEntry,
} from "../../infrastructure/repositories";
import { resolveFolder } from "../rules/folder-routing";
import type { RoutableMedia } from "../rules/folder-routing";
import { updateMedia } from "../../infrastructure/repositories/media-repository";
import { createNotification } from "./create-notification";

// ── Helpers ──────────────────────────────────────────────────────────────────

type TorrentRow = NonNullable<Awaited<ReturnType<typeof findTorrentByTitle>>>;

interface DownloadInput extends TorrentDownloadInput {
  magnetUrl?: string;
  torrentUrl?: string;
}

interface ReplaceInput extends DownloadInput {
  replaceFileIds: string[];
}

/**
 * Resolve download folder via:
 * 1. Explicit folderId from input
 * 2. Existing media.libraryId assignment
 * 3. Auto-resolve via rule engine
 * Persists the resolved folderId onto media for future reference.
 */
async function resolveDownloadConfig(
  db: Database,
  mediaRow: {
    id: string;
    type: string;
    libraryId: string | null;
    genres: string[] | null;
    genreIds: number[] | null;
    originCountry: string[] | null;
    originalLanguage: string | null;
    contentRating: string | null;
    provider: string;
  },
  inputFolderId?: string,
): Promise<{ category: string; downloadPath: string | undefined; folderId: string | undefined }> {
  // 1. Explicit folder from input (must be enabled)
  if (inputFolderId) {
    const folder = await findFolderById(db, inputFolderId);
    if (folder?.enabled) {
      // Persist assignment
      if (mediaRow.libraryId !== folder.id) {
        await updateMedia(db, mediaRow.id, { libraryId: folder.id });
      }
      return {
        category: folder.qbitCategory ?? "default",
        downloadPath: folder.downloadPath ?? undefined,
        folderId: folder.id,
      };
    }
  }

  // 2. Existing assignment (must be enabled)
  if (mediaRow.libraryId) {
    const folder = await findFolderById(db, mediaRow.libraryId);
    if (folder?.enabled) {
      return {
        category: folder.qbitCategory ?? "default",
        downloadPath: folder.downloadPath ?? undefined,
        folderId: folder.id,
      };
    }
  }

  // 3. Auto-resolve via rules
  const folders = await findAllFolders(db);
  const routable: RoutableMedia = {
    type: mediaRow.type,
    genres: mediaRow.genres,
    genreIds: mediaRow.genreIds,
    originCountry: mediaRow.originCountry,
    originalLanguage: mediaRow.originalLanguage,
    contentRating: mediaRow.contentRating,
    provider: mediaRow.provider,
  };
  const resolvedId = resolveFolder(folders, routable);
  const resolved = resolvedId ? folders.find((f) => f.id === resolvedId) : null;

  // Persist resolved assignment
  if (resolved && mediaRow.libraryId !== resolved.id) {
    await updateMedia(db, mediaRow.id, { libraryId: resolved.id });
  }

  return {
    category: resolved?.qbitCategory ?? "default",
    downloadPath: resolved?.downloadPath ?? undefined,
    folderId: resolved?.id,
  };
}

/**
 * Extract the info-hash from a magnet URI, if present.
 */
function extractHashFromMagnet(magnetOrUrl: string): string | undefined {
  if (magnetOrUrl.startsWith("magnet:")) {
    const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(magnetOrUrl);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return undefined;
}

/**
 * Resolve episode IDs from parsed season / episode numbers against the
 * media's season/episode tree.
 */
function resolveEpisodeIds(
  mediaRow: {
    type: string;
    seasons?: Array<{
      number: number;
      episodes?: Array<{ id: string; number: number }>;
    }>;
  },
  parsedSeasons: number[],
  parsedEpisodes: number[],
): Array<{ id: string; seasonNumber: number; episodeNumber: number }> {
  const episodeIds: Array<{ id: string; seasonNumber: number; episodeNumber: number }> = [];

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

  return episodeIds;
}

// ── Core download flow ───────────────────────────────────────────────────────

/**
 * Shared download logic used by both `downloadTorrent` and `replaceTorrent`.
 *
 * Steps:
 * 1. Validate magnet/torrent URL
 * 2. Fetch media with seasons/episodes
 * 3. Resolve qBit category from library (with fallback)
 * 4. Check for existing torrent by title (dedup) — handle resume/retry
 * 5. Detect quality + source from title
 * 6. Parse seasons + episodes, resolve episode IDs
 * 7. Check for duplicate media_file records
 * 8. Dedup by hash
 * 9. Create torrent DB record
 * 10. Create placeholder media_file records
 * 11. Add torrent to qBittorrent
 * 12. Poll for hash (up to 5 retries)
 */
async function coreDownload(
  db: Database,
  input: DownloadInput,
  opts: { skipDedup: boolean },
  qbClient: DownloadClientPort,
): Promise<TorrentRow> {
  const magnetOrUrl = input.magnetUrl ?? input.torrentUrl;

  if (!magnetOrUrl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Either magnetUrl or downloadUrl must be provided",
    });
  }

  // ── Fetch media with seasons/episodes for association ──

  const mediaRow = await findMediaByIdWithSeasons(db, input.mediaId);

  if (!mediaRow) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
  }

  // ── Resolve download folder (explicit, assigned, or auto via rules) ──

  const { category: qbCategory, downloadPath } = await resolveDownloadConfig(db, mediaRow, input.folderId);

  // ── Blocklist check: reject previously failed downloads ──

  if (!opts.skipDedup) {
    const blocked = await findBlocklistEntry(db, input.mediaId, input.title);
    if (blocked) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `This release is blocklisted: ${blocked.reason}`,
      });
    }
  }

  // ── Deduplication: check if we already have this torrent (by title) ──

  if (!opts.skipDedup) {
    const existingByTitle = await findTorrentByTitle(db, input.title);

    if (existingByTitle) {
      if (existingByTitle.hash) {
        try {
          await qbClient.setCategory(existingByTitle.hash, qbCategory);
        } catch {
          // Best effort
        }
      }

      if (existingByTitle.status === "completed") {
        return existingByTitle;
      }

      if (existingByTitle.status === "paused" && existingByTitle.hash) {
        await qbClient.resumeTorrent(existingByTitle.hash);
        const updated = await updateTorrent(db, existingByTitle.id, { status: "downloading" });
        return updated!;
      }

      if (["incomplete", "removed", "error"].includes(existingByTitle.status)) {
        await qbClient.addTorrent(magnetOrUrl, qbCategory);

        let hash = existingByTitle.hash;
        if (!hash && magnetOrUrl.startsWith("magnet:")) {
          const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(magnetOrUrl);
          if (match?.[1]) hash = match[1].toLowerCase();
        }

        const updated = await updateTorrent(db, existingByTitle.id, {
          hash: hash ?? existingByTitle.hash,
          status: "downloading",
          progress: 0,
          magnetUrl: input.magnetUrl ?? existingByTitle.magnetUrl,
          downloadUrl: input.torrentUrl ?? existingByTitle.downloadUrl,
        });
        return updated!;
      }

      if (existingByTitle.status === "downloading") {
        return existingByTitle;
      }
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

  const episodeIds = resolveEpisodeIds(mediaRow, parsedSeasons, parsedEpisodes);

  // ── Check for duplicate files ──

  if (!opts.skipDedup) {
    const duplicates: string[] = [];

    if (mediaRow.type === "movie") {
      const existingFile = await findDuplicateMovieFile(db, input.mediaId, quality, source);
      if (existingFile) duplicates.push(`${mediaRow.title} (${quality} ${source})`);
    } else {
      for (const ep of episodeIds) {
        const existingFile = await findDuplicateEpisodeFile(db, ep.id, quality, source);
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
  }

  // ── Extract hash from magnet link ──

  let extractedHash = extractHashFromMagnet(magnetOrUrl);

  // ── Dedup by hash ──

  if (!opts.skipDedup && extractedHash) {
    const byHash = await findTorrentByHash(db, extractedHash);
    if (byHash) {
      const updated = await updateTorrent(db, byHash.id, {
        status: "downloading",
        progress: 0,
        mediaId: input.mediaId,
        magnetUrl: input.magnetUrl ?? byHash.magnetUrl,
        downloadUrl: input.torrentUrl ?? byHash.downloadUrl,
      });
      return updated!;
    }
  }

  // ── Create torrent record ──

  const torrentRow = await createTorrent(db, {
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
  });

  if (!torrentRow) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create torrent" });
  }

  // ── Create placeholder media_file records ──

  try {
    if (mediaRow.type === "movie") {
      await createMediaFile(db, {
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
        await createMediaFile(db, {
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
    await deleteMediaFilesByTorrentId(db, torrentRow.id);
    await deleteTorrent(db, torrentRow.id);
    throw new TRPCError({
      code: "CONFLICT",
      message: "Duplicate file version detected",
    });
  }

  // ── Add to qBittorrent ──

  try {
    // Ensure category exists with correct save path
    await qbClient.ensureCategory(qbCategory, downloadPath);

    // Snapshot existing hashes before adding
    let existingHashes: Set<string>;
    try {
      const live = await qbClient.listTorrents();
      existingHashes = new Set(live.map((t) => t.hash));
    } catch {
      existingHashes = new Set();
    }

    // Resolve redirects (indexers often use redirect chains)
    const resolvedUrl = await resolveDownloadUrl(magnetOrUrl);

    // Update extracted hash if redirect resolved to a magnet link
    if (!extractedHash && resolvedUrl.startsWith("magnet:")) {
      extractedHash = extractHashFromMagnet(resolvedUrl);
      if (extractedHash) {
        await updateTorrent(db, torrentRow.id, { hash: extractedHash });
      }
    }

    await qbClient.addTorrent(resolvedUrl, qbCategory);

    // Mark media as "in library" the moment the torrent is accepted
    if (!mediaRow.inLibrary) {
      await updateMedia(db, mediaRow.id, {
        inLibrary: true,
        addedAt: mediaRow.addedAt ?? new Date(),
      });
    }

    // If no hash from magnet/URL, poll qBittorrent to find the new torrent
    if (!extractedHash) {
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const current = await qbClient.listTorrents();
          const newTorrent = current.find((t) => !existingHashes.has(t.hash));
          if (newTorrent) {
            extractedHash = newTorrent.hash;
            await updateTorrent(db, torrentRow.id, { hash: extractedHash });
            break;
          }
        } catch {
          // Retry
        }
      }
      if (!extractedHash) {
        console.warn(`[download] Could not detect hash for "${torrentRow.title}" after 15 attempts`);
      }
    }
  } catch (qbErr) {
    // qBittorrent failed — rollback DB records
    await deleteMediaFilesByTorrentId(db, torrentRow.id);
    await deleteTorrent(db, torrentRow.id);

    void createNotification(db, {
      title: "Download failed",
      message: `Failed to add "${input.title}" to qBittorrent: ${qbErr instanceof Error ? qbErr.message : "Unknown error"}`,
      type: "download_failed",
      mediaId: input.mediaId,
    }).catch(logAndSwallow("download-torrent createNotification"));

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Failed to add torrent to qBittorrent: ${qbErr instanceof Error ? qbErr.message : "Unknown error"}`,
    });
  }

  return torrentRow;
}

// ── Exported use-cases ───────────────────────────────────────────────────────

/**
 * Download a torrent: validate, dedup, create DB records, send to qBittorrent.
 */
export async function downloadTorrent(
  db: Database,
  input: DownloadInput,
  qbClient: DownloadClientPort,
): Promise<TorrentRow> {
  return coreDownload(db, input, { skipDedup: false }, qbClient);
}

/**
 * Replace existing media_file records and re-download with a new torrent.
 * Deletes the specified old files first, then runs the download flow
 * without dedup checks (since we just removed the files being replaced).
 */
export async function replaceTorrent(
  db: Database,
  input: ReplaceInput,
  qbClient: DownloadClientPort,
): Promise<TorrentRow> {
  // Delete old media_file records
  for (const fileId of input.replaceFileIds) {
    await deleteMediaFile(db, fileId);
  }

  // Run download flow skipping dedup (we just deleted the files being replaced)
  return coreDownload(db, input, { skipDedup: true }, qbClient);
}
