import { TRPCError } from "@trpc/server";

import {
  getByIdInput,
  addMagnetInput,
  addTorrentFileInput,
  importFromClientInput,
} from "@canto/validators";

import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import { createNodeFileSystemAdapter } from "@canto/core/platform/fs/filesystem";
import { autoImportTorrent } from "@canto/core/domain/torrents/use-cases/import-torrent";
import {
  extractHashFromMagnet,
  inferDownloadMeta,
  mapStatusFromLive,
  waitForTorrent,
} from "@canto/core/domain/torrents/rules/torrent-rules";
import { resolveMedia } from "@canto/core/domain/media/use-cases/persist";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getTvdbProvider } from "@canto/core/platform/http/tvdb-client";
import { updateMedia } from "@canto/core/infra/media/media-repository";
import {
  claimDownloadForImport,
  createDownload,
  findDownloadByHash,
  findDownloadById,
  updateDownload,
} from "@canto/core/infra/torrents/download-repository";

import { createTRPCRouter, adminProcedure } from "../../trpc";

export const torrentImportRouter = createTRPCRouter({
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
      const existing = await findDownloadByHash(ctx.db, hash);

      if (existing) {
        const updated = await updateDownload(ctx.db, existing.id, {
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

      const created = await createDownload(ctx.db, {
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
      const existing = await findDownloadByHash(ctx.db, live.hash);
      if (existing) {
        const updated = await updateDownload(ctx.db, existing.id, {
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

      const created = await createDownload(ctx.db, {
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

  importFromClient: adminProcedure
    .input(importFromClientInput)
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      const listed = await qb.listTorrents({ hashes: [input.hash] });
      const live = listed[0];
      if (!live) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found in qBittorrent" });

      const inferred = inferDownloadMeta(live.name);
      const currentStatus = mapStatusFromLive(live);
      const existing = await findDownloadByHash(ctx.db, live.hash);

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
        ? await updateDownload(ctx.db, existing.id, baseData)
        : await createDownload(ctx.db, {
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

  import: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findDownloadById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.imported) return { success: true, message: "Already imported" };
      if (row.importing) return { success: true, message: "Import already in progress" };
      if (row.status !== "completed" || !row.hash || !row.mediaId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent must be completed and linked to a media item to import" });
      }

      const claimed = await claimDownloadForImport(ctx.db, row.id);
      if (!claimed) return { success: true, message: "Import already in progress" };

      try {
        const qb = await getDownloadClient();
        const fs = createNodeFileSystemAdapter();
        await autoImportTorrent(ctx.db, claimed, qb, { fs });
        return { success: true };
      } catch (err) {
        await updateDownload(ctx.db, row.id, { importing: false });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Import failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }),
});
