import { TRPCError } from "@trpc/server";

import {
  torrentDownloadInput,
  torrentReplaceInput,
  deleteTorrentInput,
  renameTorrentInput,
  moveTorrentInput,
  getByIdInput,
} from "@canto/validators";

import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import { getQBClient } from "@canto/core/infra/torrent-clients/qbittorrent.adapter";
import {
  downloadTorrent,
  replaceTorrent,
} from "@canto/core/domain/torrents/use-cases/download-torrent";
import { retryTorrent } from "@canto/core/domain/torrents/use-cases/retry-torrent";
import { renameTorrent } from "@canto/core/domain/torrents/use-cases/rename-torrent";
import { buildCoreDeps } from "@canto/core/composition/core-deps";
import {
  deleteDownload as deleteTorrentRecord,
  findDownloadById,
  updateDownload,
} from "@canto/core/infra/torrents/download-repository";
import {
  deleteMediaFilesByDownloadId,
  deletePendingMediaFilesByDownloadId,
} from "@canto/core/infra/media/media-file-repository";

import { createTRPCRouter, adminProcedure } from "../../trpc";

export const torrentManageRouter = createTRPCRouter({
  download: adminProcedure
    .input(torrentDownloadInput)
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      const core = buildCoreDeps(ctx.db);
      return downloadTorrent(
        ctx.db,
        {
          logger: core.logger,
          torrents: core.torrents,
          media: core.media,
          folders: core.folders,
          extras: core.extras,
          notifications: core.notifications,
        },
        input,
        qb,
      );
    }),

  replace: adminProcedure
    .input(torrentReplaceInput)
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      const core = buildCoreDeps(ctx.db);
      return replaceTorrent(
        ctx.db,
        {
          logger: core.logger,
          torrents: core.torrents,
          media: core.media,
          folders: core.folders,
          extras: core.extras,
          notifications: core.notifications,
        },
        input,
        qb,
      );
    }),

  retry: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      const core = buildCoreDeps(ctx.db);
      const result = await retryTorrent(
        {
          torrents: core.torrents,
          folders: core.folders,
          media: core.media,
        },
        input.id,
        qb,
      );
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      return result;
    }),

  pause: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findDownloadById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) { const qb = await getDownloadClient(); await qb.pauseTorrent(row.hash); }
      return updateDownload(ctx.db, input.id, { status: "paused" });
    }),

  resume: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findDownloadById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) { const qb = await getDownloadClient(); await qb.resumeTorrent(row.hash); }
      return updateDownload(ctx.db, input.id, { status: "downloading" });
    }),

  forceResume: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findDownloadById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getDownloadClient();
      await qb.forceResumeTorrent(row.hash);
      const updated = await updateDownload(ctx.db, input.id, { status: "downloading" });
      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update torrent" });
      return updated;
    }),

  forceRecheck: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findDownloadById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getDownloadClient();
      await qb.recheckTorrent(row.hash);
      return { success: true };
    }),

  forceReannounce: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findDownloadById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getDownloadClient();
      await qb.reannounceTorrent(row.hash);
      return { success: true };
    }),

  cancel: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findDownloadById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) {
        try { const qb = await getDownloadClient(); await qb.deleteTorrent(row.hash, false); }
        catch { /* qBit may not have it */ }
      }
      // Drop placeholder media_file rows so a retry isn't blocked by the
      // dedup check. Already-imported rows (rare on cancel) are kept.
      await deletePendingMediaFilesByDownloadId(ctx.db, input.id);
      return updateDownload(ctx.db, input.id, { status: "cancelled" });
    }),

  delete: adminProcedure
    .input(deleteTorrentInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findDownloadById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });

      if (input.removeTorrent && row.hash) {
        try { const qb = await getDownloadClient(); await qb.deleteTorrent(row.hash, input.deleteFiles); }
        catch { /* qBit may not have it */ }
      }

      // Drop every media_file row linked to this download. Otherwise the
      // FK's `set null` rule leaves orphans behind that re-trigger the
      // dedup check on retry.
      await deleteMediaFilesByDownloadId(ctx.db, input.id);
      await deleteTorrentRecord(ctx.db, input.id);
      return { success: true };
    }),

  rename: adminProcedure
    .input(renameTorrentInput)
    .mutation(async ({ ctx, input }) => {
      const core = buildCoreDeps(ctx.db);
      const result = await renameTorrent(
        {
          repo: core.torrents,
          client: await getDownloadClient(),
        },
        input.id,
        input.newName,
      );
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      return result;
    }),

  move: adminProcedure
    .input(moveTorrentInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findDownloadById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getQBClient();
      await qb.setLocation(row.hash, input.newPath);
      await updateDownload(ctx.db, input.id, { contentPath: input.newPath });
      return { success: true };
    }),
});
