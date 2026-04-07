import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { torrentDownloadInput, torrentSearchInput } from "@canto/validators";

import { createTRPCRouter, adminProcedure } from "../trpc";
import { getDownloadClient } from "../infrastructure/adapters/download-client-factory";
import { buildIndexers } from "../infrastructure/adapters/indexer-factory";
import { autoImportTorrent } from "../domain/use-cases/import-torrent";
import { mergeLiveData } from "../domain/use-cases/merge-live-data";
import { searchTorrents } from "../domain/use-cases/search-torrents";
import { downloadTorrent, replaceTorrent } from "../domain/use-cases/download-torrent";
import {
  findTorrentById,
  findAllTorrents,
  findTorrentsByMediaId,
  updateTorrent,
  deleteTorrent as deleteTorrentRecord,
  claimTorrentForImport,
} from "../infrastructure/repositories/torrent-repository";

// ── Extracted use-cases ──
import { retryTorrent } from "../domain/use-cases/retry-torrent";
import { listLiveTorrents } from "../domain/use-cases/list-live-torrents";
import { renameTorrent } from "../domain/use-cases/rename-torrent";
import { getQBClient } from "../infrastructure/adapters/qbittorrent";

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
    .input(z.object({
      replaceFileIds: z.array(z.string().uuid()),
      mediaId: z.string().uuid(),
      title: z.string().min(1),
      magnetUrl: z.string().url().optional(),
      torrentUrl: z.string().url().optional(),
      seasonNumber: z.number().int().nonnegative().optional(),
      episodeNumbers: z.array(z.number().int().positive()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      return replaceTorrent(ctx.db, input, qb);
    }),

  retry: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      const result = await retryTorrent(ctx.db, input.id, qb);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      return result;
    }),

  list: adminProcedure.query(({ ctx }) => findAllTorrents(ctx.db)),

  listByMedia: adminProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(({ ctx, input }) => findTorrentsByMediaId(ctx.db, input.mediaId)),

  listLive: adminProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      cursor: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const qb = await getDownloadClient();
      return listLiveTorrents(ctx.db, input.limit, input.cursor, qb);
    }),

  listLiveByMedia: adminProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const dbRows = await findTorrentsByMediaId(ctx.db, input.mediaId);
      if (dbRows.length === 0) return [];
      const qb = await getDownloadClient();
      const merged = await mergeLiveData(ctx.db, dbRows, qb);
      return merged.map((item) => ({ ...item.row, live: item.live }));
    }),

  pause: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) { const qb = await getDownloadClient(); await qb.pauseTorrent(row.hash); }
      return updateTorrent(ctx.db, input.id, { status: "paused" });
    }),

  resume: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) { const qb = await getDownloadClient(); await qb.resumeTorrent(row.hash); }
      return updateTorrent(ctx.db, input.id, { status: "downloading" });
    }),

  cancel: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
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
    .input(z.object({ id: z.string().uuid() }))
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
    .input(z.object({
      id: z.string().uuid(),
      deleteFiles: z.boolean().default(false),
      removeTorrent: z.boolean().default(true),
    }))
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
    .input(z.object({ id: z.string().uuid(), newName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await renameTorrent(ctx.db, input.id, input.newName);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      return result;
    }),

  move: adminProcedure
    .input(z.object({ id: z.string().uuid(), newPath: z.string().min(1) }))
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
