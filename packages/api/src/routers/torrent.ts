import { TRPCError } from "@trpc/server";

import {
  torrentDownloadInput,
  torrentSearchInput,
  torrentReplaceInput,
  listLiveTorrentsInput,
  deleteTorrentInput,
  renameTorrentInput,
  moveTorrentInput,
  getByIdInput,
  getByMediaIdInput,
  addMagnetInput,
  addTorrentFileInput,
  importFromClientInput,
} from "@canto/validators";

import { createTRPCRouter, adminProcedure } from "../trpc";
import { getDownloadClient } from "@canto/core/infrastructure/adapters/download-client-factory";
import { buildIndexers } from "@canto/core/infrastructure/adapters/indexer-factory";
import { autoImportTorrent } from "@canto/core/domain/use-cases/import-torrent";
import { mergeLiveData } from "@canto/core/domain/use-cases/merge-live-data";
import { searchTorrents } from "@canto/core/domain/use-cases/search-torrents";
import { downloadTorrent, replaceTorrent } from "@canto/core/domain/use-cases/download-torrent";
import {
  findTorrentById,
  findTorrentByHash,
  findAllTorrents,
  findTorrentsByMediaId,
  updateTorrent,
  createTorrent,
  deleteTorrent as deleteTorrentRecord,
  claimTorrentForImport,
} from "@canto/core/infrastructure/repositories/torrent-repository";

// ── Extracted use-cases ──
import { retryTorrent } from "@canto/core/domain/use-cases/retry-torrent";
import { listLiveTorrents } from "@canto/core/domain/use-cases/list-live-torrents";
import { renameTorrent } from "@canto/core/domain/use-cases/rename-torrent";
import { getQBClient } from "@canto/core/infrastructure/adapters/qbittorrent";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import { getTvdbProvider } from "@canto/core/lib/tvdb-client";
import { resolveMedia } from "@canto/core/domain/use-cases/resolve-media";
import { parseEpisodes, parseSeasons } from "@canto/core/domain/rules/parsing";
import { detectQuality, detectSource } from "@canto/core/domain/rules/quality";
import { updateMedia } from "@canto/core/infrastructure/repositories/media-repository";
import type { TorrentInfo } from "@canto/core/domain/ports/download-client";

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

function extractHashFromMagnet(magnetUrl: string): string | undefined {
  const match = /xt=urn:btih:([a-zA-Z0-9]+)/i.exec(magnetUrl);
  return match?.[1]?.toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapStatusFromLive(torrent: TorrentInfo): string {
  if (torrent.progress >= 1 || torrent.state === "pausedUP") return "completed";
  if (torrent.state === "error" || torrent.state === "missingFiles") return "error";
  if (torrent.state === "pausedDL") return "paused";
  if (torrent.state.includes("stalled") && torrent.state.includes("DL")) return "stalled";
  return "downloading";
}

function inferDownloadMeta(title: string): {
  downloadType: "movie" | "season" | "episode";
  seasonNumber: number | null;
  episodeNumbers: number[] | null;
  quality: string;
  source: string;
} {
  const seasons = parseSeasons(title);
  const episodes = parseEpisodes(title);
  const downloadType: "movie" | "season" | "episode" =
    episodes.length > 0 ? "episode" : seasons.length > 0 ? "season" : "movie";
  return {
    downloadType,
    seasonNumber: seasons[0] ?? null,
    episodeNumbers: episodes.length > 0 ? episodes : null,
    quality: detectQuality(title),
    source: detectSource(title),
  };
}

async function waitForTorrent(
  qb: Awaited<ReturnType<typeof getDownloadClient>>,
  opts: { knownHashes: Set<string>; preferredHash?: string },
): Promise<TorrentInfo | null> {
  for (let attempt = 0; attempt < 15; attempt++) {
    await sleep(1500);
    const listed = opts.preferredHash
      ? await qb.listTorrents({ hashes: [opts.preferredHash] })
      : await qb.listTorrents();
    if (opts.preferredHash) {
      const byHash = listed[0];
      if (byHash) return byHash;
      continue;
    }
    const next = listed.find((t) => !opts.knownHashes.has(t.hash));
    if (next) return next;
  }
  return null;
}

export const torrentRouter = createTRPCRouter({
  search: adminProcedure
    .input(torrentSearchInput)
    .query(async ({ ctx, input }) => {
      const indexers = await buildIndexers();
      return searchTorrents(ctx.db, input, indexers);
    }),

  download: adminProcedure
    .input(torrentDownloadInput)
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      return downloadTorrent(ctx.db, input, qb);
    }),

  replace: adminProcedure
    .input(torrentReplaceInput)
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      return replaceTorrent(ctx.db, input, qb);
    }),

  retry: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      const result = await retryTorrent(ctx.db, input.id, qb);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      return result;
    }),

  list: adminProcedure.query(({ ctx }) => findAllTorrents(ctx.db)),

  listByMedia: adminProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) => findTorrentsByMediaId(ctx.db, input.mediaId)),

  listLive: adminProcedure
    .input(listLiveTorrentsInput)
    .query(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      return listLiveTorrents(ctx.db, input.limit, input.cursor, qb);
    }),

  listLiveByMedia: adminProcedure
    .input(getByMediaIdInput)
    .query(async ({ ctx, input }) => {
      const dbRows = await findTorrentsByMediaId(ctx.db, input.mediaId);
      if (dbRows.length === 0) return [];
      const qb = await getDownloadClient();
      const merged = await mergeLiveData(ctx.db, dbRows, qb);
      return merged.map((item) => ({ ...item.row, live: item.live }));
    }),

  addMagnet: adminProcedure
    .input(addMagnetInput)
    .mutation(async ({ ctx, input }) => {
      const magnetUrl = input.magnetUrl.trim();
      const qb = await getDownloadClient();
      const knownHashes = new Set((await qb.listTorrents()).map((t) => t.hash));
      const extractedHash = extractHashFromMagnet(magnetUrl);

      await qb.addTorrent(magnetUrl);

      const live = await waitForTorrent(qb, {
        knownHashes,
        preferredHash: extractedHash,
      });
      const hash = live?.hash ?? extractedHash ?? null;
      if (!hash) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Torrent was added to qBittorrent, but Canto could not resolve its hash yet",
        });
      }

      const dnMatch = /[?&]dn=([^&]+)/i.exec(magnetUrl);
      let decodedName: string | undefined;
      if (dnMatch?.[1]) {
        try {
          decodedName = decodeURIComponent(dnMatch[1].replace(/\+/g, "%20"));
        } catch {
          decodedName = undefined;
        }
      }
      const fallbackTitle = decodedName ?? hash;
      const title = live?.name ?? fallbackTitle;
      const inferred = inferDownloadMeta(title);
      const nextStatus = live ? mapStatusFromLive(live) : "downloading";
      const existing = await findTorrentByHash(ctx.db, hash);

      if (existing) {
        const updated = await updateTorrent(ctx.db, existing.id, {
          title,
          magnetUrl,
          status: nextStatus,
          progress: live?.progress ?? existing.progress ?? 0,
          fileSize: live?.size ?? existing.fileSize ?? null,
          contentPath: live?.content_path ?? existing.contentPath ?? null,
          quality: inferred.quality,
          source: inferred.source,
          downloadType: inferred.downloadType,
          seasonNumber: inferred.seasonNumber,
          episodeNumbers: inferred.episodeNumbers,
        });
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update torrent" });
        return updated;
      }

      const created = await createTorrent(ctx.db, {
        hash,
        title,
        magnetUrl,
        status: nextStatus,
        progress: live?.progress ?? 0,
        fileSize: live?.size ?? null,
        contentPath: live?.content_path ?? null,
        quality: inferred.quality,
        source: inferred.source,
        downloadType: inferred.downloadType,
        seasonNumber: inferred.seasonNumber,
        episodeNumbers: inferred.episodeNumbers,
      });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create torrent" });
      return created;
    }),

  addTorrentFile: adminProcedure
    .input(addTorrentFileInput)
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      const knownHashes = new Set((await qb.listTorrents()).map((t) => t.hash));
      const fileData = Uint8Array.from(Buffer.from(input.fileBase64, "base64"));
      if (fileData.byteLength === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid .torrent file data" });
      }

      await qb.addTorrentFile(input.fileName, fileData);

      const live = await waitForTorrent(qb, { knownHashes });
      if (!live?.hash) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Torrent was added to qBittorrent, but Canto could not detect it yet",
        });
      }

      const inferred = inferDownloadMeta(live.name);
      const nextStatus = mapStatusFromLive(live);
      const existing = await findTorrentByHash(ctx.db, live.hash);
      if (existing) {
        const updated = await updateTorrent(ctx.db, existing.id, {
          title: live.name,
          status: nextStatus,
          progress: live.progress,
          fileSize: live.size,
          contentPath: live.content_path ?? existing.contentPath ?? null,
          quality: inferred.quality,
          source: inferred.source,
          downloadType: inferred.downloadType,
          seasonNumber: inferred.seasonNumber,
          episodeNumbers: inferred.episodeNumbers,
        });
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update torrent" });
        return updated;
      }

      const created = await createTorrent(ctx.db, {
        hash: live.hash,
        title: live.name,
        status: nextStatus,
        progress: live.progress,
        fileSize: live.size,
        contentPath: live.content_path ?? null,
        quality: inferred.quality,
        source: inferred.source,
        downloadType: inferred.downloadType,
        seasonNumber: inferred.seasonNumber,
        episodeNumbers: inferred.episodeNumbers,
      });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create torrent" });
      return created;
    }),

  listClient: adminProcedure.query(async ({ ctx }) => {
    const qb = await getDownloadClient();
    const [live, tracked] = await Promise.all([qb.listTorrents(), findAllTorrents(ctx.db)]);
    const byHash = new Map(tracked.filter((t) => !!t.hash).map((t) => [t.hash!, t]));
    return live
      .map((item) => {
        const linked = byHash.get(item.hash);
        return {
          hash: item.hash,
          name: item.name,
          state: item.state,
          progress: item.progress,
          size: item.size,
          dlspeed: item.dlspeed,
          upspeed: item.upspeed,
          eta: item.eta,
          addedOn: item.added_on,
          completionOn: item.completion_on,
          tracked: !!linked,
          trackedTorrentId: linked?.id ?? null,
          trackedMediaId: linked?.mediaId ?? null,
          trackedStatus: linked?.status ?? null,
        };
      })
      .sort((a, b) => b.addedOn - a.addedOn);
  }),

  importFromClient: adminProcedure
    .input(importFromClientInput)
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      const listed = await qb.listTorrents({ hashes: [input.hash] });
      const live = listed[0];
      if (!live) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found in qBittorrent" });

      const inferred = inferDownloadMeta(live.name);
      const currentStatus = mapStatusFromLive(live);
      const existing = await findTorrentByHash(ctx.db, live.hash);

      const tmdb = await getTmdbProvider();
      const tvdb = await getTvdbProvider();
      const resolved = await resolveMedia(
        ctx.db,
        {
          externalId: input.mediaExternalId,
          provider: input.mediaProvider,
          type: input.mediaType,
        },
        ctx.session.user.id,
        { tmdb, tvdb },
      );

      await updateMedia(ctx.db, resolved.mediaId, { inLibrary: true, addedAt: new Date() });

      const resolvedDownloadType = input.downloadType;
      const resolvedSeasonNumber = input.seasonNumber ?? null;
      const resolvedEpisodeNumbers =
        input.downloadType === "episode"
          ? input.episodeNumbers ?? null
          : input.episodeNumbers?.length
            ? input.episodeNumbers
            : null;

      const baseData = {
        mediaId: resolved.mediaId,
        title: live.name,
        status: currentStatus,
        progress: live.progress,
        fileSize: live.size,
        contentPath: live.content_path ?? null,
        quality: inferred.quality,
        source: inferred.source,
        downloadType: resolvedDownloadType,
        seasonNumber: resolvedSeasonNumber,
        episodeNumbers: resolvedEpisodeNumbers,
      };

      const torrent = existing
        ? await updateTorrent(ctx.db, existing.id, baseData)
        : await createTorrent(ctx.db, {
            ...baseData,
            hash: live.hash,
            magnetUrl: null,
          });

      if (!torrent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to import torrent" });
      return {
        torrent,
        mediaId: resolved.mediaId,
        mediaTitle: resolved.media.title,
        alreadyLinked: false,
      };
    }),

  pause: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) { const qb = await getDownloadClient(); await qb.pauseTorrent(row.hash); }
      return updateTorrent(ctx.db, input.id, { status: "paused" });
    }),

  resume: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) { const qb = await getDownloadClient(); await qb.resumeTorrent(row.hash); }
      return updateTorrent(ctx.db, input.id, { status: "downloading" });
    }),

  forceResume: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getDownloadClient();
      await qb.forceResumeTorrent(row.hash);
      const updated = await updateTorrent(ctx.db, input.id, { status: "downloading" });
      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update torrent" });
      return updated;
    }),

  forceRecheck: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getDownloadClient();
      await qb.recheckTorrent(row.hash);
      return { success: true };
    }),

  forceReannounce: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getDownloadClient();
      await qb.reannounceTorrent(row.hash);
      return { success: true };
    }),

  cancel: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) {
        try { const qb = await getDownloadClient(); await qb.deleteTorrent(row.hash, false); }
        catch { /* qBit may not have it */ }
      }
      return updateTorrent(ctx.db, input.id, { status: "cancelled" });
    }),

  import: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.imported) return { success: true, message: "Already imported" };
      if (row.importing) return { success: true, message: "Import already in progress" };
      if (row.status !== "completed" || !row.hash || !row.mediaId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent must be completed and linked to a media item to import" });
      }

      const claimed = await claimTorrentForImport(ctx.db, row.id);
      if (!claimed) return { success: true, message: "Import already in progress" };

      try {
        const qb = await getDownloadClient();
        await autoImportTorrent(ctx.db, claimed, qb);
        return { success: true };
      } catch (err) {
        await updateTorrent(ctx.db, row.id, { importing: false });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Import failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }),

  delete: adminProcedure
    .input(deleteTorrentInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });

      if (input.removeTorrent && row.hash) {
        try { const qb = await getDownloadClient(); await qb.deleteTorrent(row.hash, input.deleteFiles); }
        catch { /* qBit may not have it */ }
      }

      await deleteTorrentRecord(ctx.db, input.id);
      return { success: true };
    }),

  rename: adminProcedure
    .input(renameTorrentInput)
    .mutation(async ({ ctx, input }) => {
      const result = await renameTorrent(ctx.db, input.id, input.newName);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      return result;
    }),

  move: adminProcedure
    .input(moveTorrentInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getQBClient();
      await qb.setLocation(row.hash, input.newPath);
      await updateTorrent(ctx.db, input.id, { contentPath: input.newPath });
      return { success: true };
    }),
});
