import type { Database } from "@canto/db/client";
import type { TorrentDownloadInput } from "@canto/validators";

import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import type { MediaExtrasRepositoryPort } from "@canto/core/domain/media/ports/media-extras-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import { createNotification } from "@canto/core/domain/notifications/use-cases/create-notification";
import type { NotificationsRepositoryPort } from "@canto/core/domain/notifications/ports/notifications-repository.port";
import { MediaNotFoundError } from "@canto/core/domain/shared/errors";
import type { DownloadClientPort } from "@canto/core/domain/shared/ports/download-client";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import { resolveDownloadUrl } from "@canto/core/domain/shared/services/resolve-download-url";
import {
  BlocklistedReleaseError,
  DownloadClientError,
  DuplicateDownloadError,
  InvalidDownloadInputError,
  TorrentPersistenceError,
} from "@canto/core/domain/torrents/errors";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";
import {
  parseEpisodes,
  parseSeasons,
} from "@canto/core/domain/torrents/rules/parsing";
import {
  detectRepackCount,
  detectReleaseGroup,
} from "@canto/core/domain/torrents/rules/parsing-release";
import { detectQuality, detectSource } from "@canto/core/domain/torrents/rules/quality";
import { extractHashFromMagnet } from "@canto/core/domain/torrents/rules/torrent-rules";
import type { Download } from "@canto/core/domain/torrents/types/download";
import {
  detectDuplicates,
  resolveEpisodeIds,
} from "@canto/core/domain/torrents/use-cases/download-torrent/duplicate-detection";
import { resolveDownloadConfig } from "@canto/core/domain/torrents/use-cases/download-torrent/folder-resolution";

export type TorrentRow = Download;

export interface DownloadInput extends TorrentDownloadInput {
  magnetUrl?: string;
  torrentUrl?: string;
}

export interface CoreDownloadOptions {
  skipDedup: boolean;
}

export interface DownloadTorrentDeps {
  logger: LoggerPort;
  torrents: TorrentsRepositoryPort;
  media: MediaRepositoryPort;
  folders?: FoldersRepositoryPort;
  extras?: MediaExtrasRepositoryPort;
  notifications?: NotificationsRepositoryPort;
}

const HASH_POLL_ATTEMPTS = 15;
const HASH_POLL_INTERVAL_MS = 2000;

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
 * 12. Poll for hash (up to 15 retries)
 */
export async function coreDownload(
  _db: Database,
  deps: DownloadTorrentDeps,
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

  const mediaRow = await deps.media.findByIdWithSeasons(input.mediaId);
  if (!mediaRow) {
    throw new MediaNotFoundError(input.mediaId);
  }

  if (!deps.folders || !deps.extras) {
    throw new InvalidDownloadInputError(
      "Folder + extras repositories required to resolve download config",
    );
  }
  const { category: qbCategory, downloadPath } = await resolveDownloadConfig(
    { folders: deps.folders, media: deps.media, extras: deps.extras },
    mediaRow,
    input.folderId,
  );

  if (!opts.skipDedup) {
    const blocked = await deps.torrents.findBlocklistEntry(
      input.mediaId,
      input.title,
    );
    if (blocked) {
      throw new BlocklistedReleaseError(blocked.reason);
    }
  }

  if (!opts.skipDedup) {
    const existingByTitle = await deps.torrents.findDownloadByTitle(input.title);

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
        const updated = await deps.torrents.updateDownload(existingByTitle.id, {
          status: "downloading",
        });
        if (!updated) throw new TorrentPersistenceError();
        return updated;
      }

      if (
        existingByTitle.status === "incomplete" ||
        existingByTitle.status === "removed" ||
        existingByTitle.status === "error"
      ) {
        await qbClient.addTorrent(magnetOrUrl, qbCategory, downloadPath);

        let hash = existingByTitle.hash;
        if (!hash && magnetOrUrl.startsWith("magnet:")) {
          const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(magnetOrUrl);
          if (match?.[1]) hash = match[1].toLowerCase();
        }

        const updated = await deps.torrents.updateDownload(existingByTitle.id, {
          hash: hash ?? existingByTitle.hash,
          status: "downloading",
          progress: 0,
          magnetUrl: input.magnetUrl ?? existingByTitle.magnetUrl,
          downloadUrl: input.torrentUrl ?? existingByTitle.downloadUrl,
        });
        if (!updated) throw new TorrentPersistenceError();
        return updated;
      }

      if (existingByTitle.status === "downloading") {
        return existingByTitle;
      }
    }
  }

  const quality = detectQuality(input.title);
  const source = detectSource(input.title);

  const parsedSeasons =
    input.seasonNumber !== undefined
      ? [input.seasonNumber]
      : parseSeasons(input.title);
  const parsedEpisodes = input.episodeNumbers ?? parseEpisodes(input.title);

  const torrentType =
    mediaRow.type === "movie"
      ? "movie"
      : parsedEpisodes.length > 0
        ? "episode"
        : "season";

  const episodeIds = resolveEpisodeIds(mediaRow, parsedSeasons, parsedEpisodes);

  if (!opts.skipDedup) {
    const duplicates = await detectDuplicates(
      deps.torrents,
      mediaRow,
      input.mediaId,
      quality,
      source,
      episodeIds,
    );
    if (duplicates.length > 0) {
      throw new DuplicateDownloadError(
        `Already downloaded in ${quality} ${source}: ${duplicates.join(", ")}`,
      );
    }
  }

  let extractedHash = extractHashFromMagnet(magnetOrUrl);

  if (!opts.skipDedup && extractedHash) {
    const byHash = await deps.torrents.findDownloadByHash(extractedHash);
    if (byHash) {
      const updated = await deps.torrents.updateDownload(byHash.id, {
        status: "downloading",
        progress: 0,
        mediaId: input.mediaId,
        magnetUrl: input.magnetUrl ?? byHash.magnetUrl,
        downloadUrl: input.torrentUrl ?? byHash.downloadUrl,
      });
      if (!updated) throw new TorrentPersistenceError();
      return updated;
    }
  }

  const torrentRow = await deps.torrents.createDownload({
    mediaId: input.mediaId,
    title: input.title,
    hash: extractedHash ?? null,
    magnetUrl: input.magnetUrl ?? null,
    downloadUrl: input.torrentUrl ?? null,
    quality,
    source,
    downloadType: torrentType,
    seasonNumber: input.seasonNumber ?? parsedSeasons[0] ?? null,
    episodeNumbers:
      input.episodeNumbers ?? (parsedEpisodes.length > 0 ? parsedEpisodes : null),
    status: "downloading",
    repackCount: detectRepackCount(input.title),
    releaseGroup: detectReleaseGroup(input.title),
  });

  try {
    if (mediaRow.type === "movie") {
      await deps.torrents.createMediaFile({
        mediaId: input.mediaId,
        episodeId: null,
        downloadId: torrentRow.id,
        filePath: "",
        quality,
        source,
        status: "pending",
      });
    } else {
      for (const ep of episodeIds) {
        await deps.torrents.createMediaFile({
          mediaId: input.mediaId,
          episodeId: ep.id,
          downloadId: torrentRow.id,
          filePath: "",
          quality,
          source,
          status: "pending",
        });
      }
    }
  } catch {
    await deps.torrents.deleteMediaFilesByDownloadId(torrentRow.id);
    await deps.torrents.deleteDownload(torrentRow.id);
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
        await deps.torrents.updateDownload(torrentRow.id, { hash: extractedHash });
      }
    }

    await qbClient.addTorrent(resolvedUrl, qbCategory, downloadPath);

    if (!mediaRow.inLibrary) {
      await deps.media.updateMedia(mediaRow.id, {
        inLibrary: true,
        addedAt: mediaRow.addedAt ?? new Date(),
      });
    }

    if (!extractedHash) {
      for (let attempt = 0; attempt < HASH_POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) =>
          setTimeout(resolve, HASH_POLL_INTERVAL_MS),
        );
        try {
          const current = await qbClient.listTorrents();
          const newTorrent = current.find((t) => !existingHashes.has(t.hash));
          if (newTorrent) {
            extractedHash = newTorrent.hash;
            await deps.torrents.updateDownload(torrentRow.id, {
              hash: extractedHash,
            });
            break;
          }
        } catch {
          // Retry
        }
      }
      if (!extractedHash) {
        deps.logger.warn(
          `[download] Could not detect hash for "${torrentRow.title}" after ${HASH_POLL_ATTEMPTS} attempts`,
        );
        await deps.torrents.updateDownload(torrentRow.id, { status: "failed" });
      }
    }
  } catch (qbErr) {
    await deps.torrents.deleteMediaFilesByDownloadId(torrentRow.id);
    await deps.torrents.deleteDownload(torrentRow.id);

    if (deps.notifications) {
      void createNotification(
        { repo: deps.notifications },
        {
          title: "Download failed",
          message: `Failed to add "${input.title}" to qBittorrent: ${qbErr instanceof Error ? qbErr.message : "Unknown error"}`,
          type: "download_failed",
          mediaId: input.mediaId,
        },
      ).catch(deps.logger.logAndSwallow("download-torrent createNotification"));
    }

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
  deps: DownloadTorrentDeps,
  input: DownloadInput,
  qbClient: DownloadClientPort,
): Promise<TorrentRow> {
  return coreDownload(db, deps, input, { skipDedup: false }, qbClient);
}
