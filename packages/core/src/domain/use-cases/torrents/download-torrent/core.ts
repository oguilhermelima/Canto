import type { Database } from "@canto/db/client";
import type { TorrentDownloadInput } from "@canto/validators";

import { BlocklistedReleaseError, DownloadClientError, DuplicateDownloadError, InvalidDownloadInputError, TorrentPersistenceError } from "@canto/core/domain/torrents/errors";
import { MediaNotFoundError } from "@canto/core/domain/shared/errors";
import { logAndSwallow } from "../../../../lib/log-error";
import { resolveDownloadUrl } from "../../../../lib/follow-redirects";
import { detectQuality, detectSource } from "../../../torrents/rules/quality";
import { parseSeasons, parseEpisodes } from "../../../torrents/rules/parsing";
import { extractHashFromMagnet } from "../../../torrents/rules/torrent-rules";
import type { DownloadClientPort } from "../../../shared/ports/download-client";
import {
  findMediaByIdWithSeasons,
  findTorrentByTitle,
  findTorrentByHash,
  createTorrent,
  updateTorrent,
  deleteTorrent,
  createMediaFile,
  deleteMediaFilesByTorrentId,
  findBlocklistEntry,
} from "../../../../infrastructure/repositories";
import { updateMedia } from "../../../../infrastructure/repositories/media/media-repository";
import { createNotification } from "../../notifications/create-notification";
import { resolveDownloadConfig } from "./folder-resolution";
import { resolveEpisodeIds, detectDuplicates } from "./duplicate-detection";

type TorrentRow = NonNullable<Awaited<ReturnType<typeof findTorrentByTitle>>>;

export interface DownloadInput extends TorrentDownloadInput {
  magnetUrl?: string;
  torrentUrl?: string;
}

export interface CoreDownloadOptions {
  skipDedup: boolean;
}

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
export async function coreDownload(
  db: Database,
  input: DownloadInput,
  opts: CoreDownloadOptions,
  qbClient: DownloadClientPort,
): Promise<TorrentRow> {
  const magnetOrUrl = input.magnetUrl ?? input.torrentUrl;

  if (!magnetOrUrl) {
    throw new InvalidDownloadInputError(
      "Either magnetUrl or downloadUrl must be provided",
    );
  }

  const mediaRow = await findMediaByIdWithSeasons(db, input.mediaId);

  if (!mediaRow) {
    throw new MediaNotFoundError(input.mediaId);
  }

  const { category: qbCategory, downloadPath } = await resolveDownloadConfig(db, mediaRow, input.folderId);

  if (!opts.skipDedup) {
    const blocked = await findBlocklistEntry(db, input.mediaId, input.title);
    if (blocked) {
      throw new BlocklistedReleaseError(blocked.reason);
    }
  }

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
        await qbClient.addTorrent(magnetOrUrl, qbCategory, downloadPath);

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

  const quality = detectQuality(input.title);
  const source = detectSource(input.title);

  const parsedSeasons = input.seasonNumber != null ? [input.seasonNumber] : parseSeasons(input.title);
  const parsedEpisodes = input.episodeNumbers ?? parseEpisodes(input.title);

  const torrentType = mediaRow.type === "movie"
    ? "movie"
    : (parsedEpisodes.length > 0 ? "episode" : "season");

  const episodeIds = resolveEpisodeIds(mediaRow, parsedSeasons, parsedEpisodes);

  if (!opts.skipDedup) {
    const duplicates = await detectDuplicates(db, mediaRow, input.mediaId, quality, source, episodeIds);
    if (duplicates.length > 0) {
      throw new DuplicateDownloadError(
        `Already downloaded in ${quality} ${source}: ${duplicates.join(", ")}`,
      );
    }
  }

  let extractedHash = extractHashFromMagnet(magnetOrUrl);

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
    throw new TorrentPersistenceError();
  }

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
    await deleteMediaFilesByTorrentId(db, torrentRow.id);
    await deleteTorrent(db, torrentRow.id);
    throw new DuplicateDownloadError("Duplicate file version detected");
  }

  try {
    await qbClient.ensureCategory(qbCategory, downloadPath);

    let existingHashes: Set<string>;
    try {
      const live = await qbClient.listTorrents();
      existingHashes = new Set(live.map((t) => t.hash));
    } catch {
      existingHashes = new Set();
    }

    const resolvedUrl = await resolveDownloadUrl(magnetOrUrl);

    if (!extractedHash && resolvedUrl.startsWith("magnet:")) {
      extractedHash = extractHashFromMagnet(resolvedUrl);
      if (extractedHash) {
        await updateTorrent(db, torrentRow.id, { hash: extractedHash });
      }
    }

    await qbClient.addTorrent(resolvedUrl, qbCategory, downloadPath);

    if (!mediaRow.inLibrary) {
      await updateMedia(db, mediaRow.id, {
        inLibrary: true,
        addedAt: mediaRow.addedAt ?? new Date(),
      });
    }

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
        await updateTorrent(db, torrentRow.id, { status: "failed" });
      }
    }
  } catch (qbErr) {
    await deleteMediaFilesByTorrentId(db, torrentRow.id);
    await deleteTorrent(db, torrentRow.id);

    void createNotification(db, {
      title: "Download failed",
      message: `Failed to add "${input.title}" to qBittorrent: ${qbErr instanceof Error ? qbErr.message : "Unknown error"}`,
      type: "download_failed",
      mediaId: input.mediaId,
    }).catch(logAndSwallow("download-torrent createNotification"));

    throw new DownloadClientError(
      `Failed to add torrent to qBittorrent: ${qbErr instanceof Error ? qbErr.message : "Unknown error"}`,
    );
  }

  return torrentRow;
}

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
