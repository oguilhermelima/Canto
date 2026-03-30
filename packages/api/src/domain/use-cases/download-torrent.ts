import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { blocklist, library, media, mediaFile, torrent } from "@canto/db/schema";
import type { TorrentDownloadInput } from "@canto/validators";

import { detectQuality, detectSource } from "../rules/quality";
import { parseSeasons, parseEpisodes } from "../rules/parsing";
import { getQBClient } from "../../infrastructure/adapters/qbittorrent";
import { createNotification } from "./create-notification";

// ── Helpers ──────────────────────────────────────────────────────────────────

type TorrentRow = typeof torrent.$inferSelect;

interface DownloadInput extends TorrentDownloadInput {
  magnetUrl?: string;
  torrentUrl?: string;
}

interface ReplaceInput extends DownloadInput {
  replaceFileIds: string[];
}

/**
 * Resolve the qBittorrent category from the media's library assignment,
 * falling back to the default library for the media type.
 */
async function resolveQBCategory(
  db: Database,
  mediaRow: { type: string; libraryId: string | null },
): Promise<string> {
  if (mediaRow.libraryId) {
    const assignedLib = await db.query.library.findFirst({
      where: eq(library.id, mediaRow.libraryId),
      columns: { qbitCategory: true },
    });
    return assignedLib?.qbitCategory ?? (mediaRow.type === "show" ? "shows" : "movies");
  }

  const mediaType = mediaRow.type === "show" ? "shows" : "movies";
  const defaultLib = await db.query.library.findFirst({
    where: and(eq(library.type, mediaType), eq(library.isDefault, true)),
    columns: { qbitCategory: true },
  });
  return defaultLib?.qbitCategory ?? mediaType;
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
): Promise<TorrentRow> {
  const magnetOrUrl = input.magnetUrl ?? input.torrentUrl;

  if (!magnetOrUrl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Either magnetUrl or downloadUrl must be provided",
    });
  }

  // ── Fetch media with seasons/episodes for association ──

  const mediaRow = await db.query.media.findFirst({
    where: eq(media.id, input.mediaId),
    with: { seasons: { with: { episodes: true } } },
  });

  if (!mediaRow) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
  }

  // ── Resolve qBittorrent category from library assignment ──

  const qbCategory = await resolveQBCategory(db, mediaRow);

  // ── Blocklist check: reject previously failed downloads ──

  if (!opts.skipDedup) {
    const blocked = await db.query.blocklist.findFirst({
      where: and(
        eq(blocklist.mediaId, input.mediaId),
        eq(blocklist.title, input.title),
      ),
    });
    if (blocked) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `This release is blocklisted: ${blocked.reason}`,
      });
    }
  }

  // ── Deduplication: check if we already have this torrent (by title) ──

  if (!opts.skipDedup) {
    const existingByTitle = await db.query.torrent.findFirst({
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
        const [updated] = await db
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

        const [updated] = await db
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
      const existingFile = await db.query.mediaFile.findFirst({
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
        const existingFile = await db.query.mediaFile.findFirst({
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
  }

  // ── Extract hash from magnet link ──

  let extractedHash = extractHashFromMagnet(magnetOrUrl);

  // ── Dedup by hash ──

  if (!opts.skipDedup && extractedHash) {
    const byHash = await db.query.torrent.findFirst({
      where: eq(torrent.hash, extractedHash),
    });
    if (byHash) {
      const [updated] = await db
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

  const [torrentRow] = await db
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
      await db.insert(mediaFile).values({
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
        await db.insert(mediaFile).values({
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
    await db.delete(mediaFile).where(eq(mediaFile.torrentId, torrentRow.id));
    await db.delete(torrent).where(eq(torrent.id, torrentRow.id));
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

    // If no hash from magnet/URL, poll qBittorrent to find the new torrent
    if (!extractedHash) {
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const current = await qb.listTorrents();
          const newTorrent = current.find((t) => !existingHashes.has(t.hash));
          if (newTorrent) {
            extractedHash = newTorrent.hash;
            await db
              .update(torrent)
              .set({ hash: extractedHash, updatedAt: new Date() })
              .where(eq(torrent.id, torrentRow.id));
            break;
          }
        } catch {
          // Retry
        }
      }
      if (!extractedHash) {
        console.warn(`[download] Could not detect hash for "${torrentRow.title}" after 5 attempts`);
      }
    }
  } catch (qbErr) {
    // qBittorrent failed — rollback DB records
    await db.delete(mediaFile).where(eq(mediaFile.torrentId, torrentRow.id));
    await db.delete(torrent).where(eq(torrent.id, torrentRow.id));

    void createNotification(db, {
      title: "Download failed",
      message: `Failed to add "${input.title}" to qBittorrent: ${qbErr instanceof Error ? qbErr.message : "Unknown error"}`,
      type: "download_failed",
      mediaId: input.mediaId,
    }).catch(() => {});

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
): Promise<TorrentRow> {
  return coreDownload(db, input, { skipDedup: false });
}

/**
 * Replace existing media_file records and re-download with a new torrent.
 * Deletes the specified old files first, then runs the download flow
 * without dedup checks (since we just removed the files being replaced).
 */
export async function replaceTorrent(
  db: Database,
  input: ReplaceInput,
): Promise<TorrentRow> {
  // Delete old media_file records
  for (const fileId of input.replaceFileIds) {
    await db.delete(mediaFile).where(eq(mediaFile.id, fileId));
  }

  // Run download flow skipping dedup (we just deleted the files being replaced)
  return coreDownload(db, input, { skipDedup: true });
}
