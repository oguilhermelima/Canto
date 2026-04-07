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
  findAllTorrents,
  findTorrentsByMediaId,
  updateTorrent,
  deleteTorrent as deleteTorrentRecord,
  claimTorrentForImport,
} from "@canto/core/infrastructure/repositories/torrent-repository";

// ── Extracted use-cases ──
import { retryTorrent } from "@canto/core/domain/use-cases/retry-torrent";
import { listLiveTorrents } from "@canto/core/domain/use-cases/list-live-torrents";
import { renameTorrent } from "@canto/core/domain/use-cases/rename-torrent";
import { getQBClient } from "@canto/core/infrastructure/adapters/qbittorrent";

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

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
