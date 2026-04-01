import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { torrentDownloadInput, torrentSearchInput } from "@canto/validators";

import { createTRPCRouter, adminProcedure } from "../trpc";
import { getQBClient } from "../infrastructure/adapters/qbittorrent";
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
import { findMediaById } from "../infrastructure/repositories/media-repository";
import { findDefaultLibrary, findLibraryById } from "../infrastructure/repositories/library-repository";

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const torrentRouter = createTRPCRouter({
  /**
   * Search for torrents via Prowlarr/Jackett, building a search query from the
   * media item's title (+ season number if provided).
   */
  search: adminProcedure
    .input(torrentSearchInput)
    .query(({ ctx, input }) => searchTorrents(ctx.db, input)),

  /**
   * Send a magnet/torrent URL to qBittorrent and create a torrent DB record.
   * Pre-associates media_file placeholders so we know what episodes are
   * covered BEFORE the download completes.
   */
  download: adminProcedure
    .input(torrentDownloadInput)
    .mutation(({ ctx, input }) => downloadTorrent(ctx.db, input)),

  /**
   * Replace existing media_file records and re-download with a new torrent.
   * Deletes the specified old files, then runs the standard download flow.
   */
  replace: adminProcedure
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
    .mutation(({ ctx, input }) => replaceTorrent(ctx.db, input)),

  /**
   * Re-download a torrent that was removed or errored.
   */
  retry: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });

      const url = row.magnetUrl ?? row.downloadUrl;
      if (!url) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No download URL saved for this torrent." });
      }

      const linkedMedia = row.mediaId ? await findMediaById(ctx.db, row.mediaId) : null;
      let retryCategory: string;
      if (linkedMedia?.libraryId) {
        const lib = await findLibraryById(ctx.db, linkedMedia.libraryId);
        retryCategory = lib?.qbitCategory ?? (linkedMedia.type === "show" ? "shows" : "movies");
      } else {
        const mediaType = linkedMedia?.type === "show" ? "shows" : "movies";
        const lib = await findDefaultLibrary(ctx.db, mediaType);
        retryCategory = lib?.qbitCategory ?? mediaType;
      }

      const qb = await getQBClient();
      await qb.addTorrent(url, retryCategory);

      let newHash = row.hash;
      if (!newHash && url.startsWith("magnet:")) {
        const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(url);
        if (match?.[1]) newHash = match[1].toLowerCase();
      }

      return updateTorrent(ctx.db, input.id, { hash: newHash, status: "downloading", progress: 0 });
    }),

  /**
   * List all torrent records from the database.
   */
  list: adminProcedure.query(({ ctx }) => findAllTorrents(ctx.db)),

  listByMedia: adminProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(({ ctx, input }) => findTorrentsByMediaId(ctx.db, input.mediaId)),

  /**
   * List live torrent data from qBittorrent merged with DB records + media info.
   */
  listLive: adminProcedure.query(async ({ ctx }) => {
    const dbRows = await findAllTorrents(ctx.db);
    const merged = await mergeLiveData(ctx.db, dbRows);

    // Batch-fetch linked media info
    const mediaIds = [...new Set(dbRows.map((r) => r.mediaId).filter(Boolean))] as string[];
    const mediaMap = new Map<string, { id: string; title: string; posterPath: string | null; type: string; year: number | null }>();
    for (const id of mediaIds) {
      const m = await findMediaById(ctx.db, id);
      if (m) mediaMap.set(m.id, { id: m.id, title: m.title, posterPath: m.posterPath, type: m.type, year: m.year });
    }

    return merged.map((item) => ({
      ...item.row,
      media: item.row.mediaId ? mediaMap.get(item.row.mediaId) ?? null : null,
      live: item.live,
    }));
  }),

  /**
   * List live torrent data for a specific media, merged with qBittorrent.
   */
  listLiveByMedia: adminProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const dbRows = await findTorrentsByMediaId(ctx.db, input.mediaId);
      if (dbRows.length === 0) return [];
      const merged = await mergeLiveData(ctx.db, dbRows);
      return merged.map((item) => ({ ...item.row, live: item.live }));
    }),

  /**
   * Pause a torrent in qBittorrent.
   */
  pause: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) { const qb = await getQBClient(); await qb.pauseTorrent(row.hash); }
      return updateTorrent(ctx.db, input.id, { status: "paused" });
    }),

  resume: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) { const qb = await getQBClient(); await qb.resumeTorrent(row.hash); }
      return updateTorrent(ctx.db, input.id, { status: "downloading" });
    }),

  cancel: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (row.hash) { const qb = await getQBClient(); await qb.pauseTorrent(row.hash); }
      return updateTorrent(ctx.db, input.id, { status: "paused" });
    }),

  /**
   * Trigger import for a completed torrent — organizes files and triggers Jellyfin scan.
   */
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

      // Atomically set importing = true
      const claimed = await claimTorrentForImport(ctx.db, row.id);
      if (!claimed) return { success: true, message: "Import already in progress" };

      try {
        const qb = await getQBClient();
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

  /**
   * Delete a torrent record from DB and optionally from qBittorrent.
   */
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
        try { const qb = await getQBClient(); await qb.deleteTorrent(row.hash, input.deleteFiles); }
        catch { /* qBit may not have it */ }
      }

      await deleteTorrentRecord(ctx.db, input.id);
      return { success: true };
    }),

  /**
   * Rename a torrent's file in qBittorrent.
   */
  rename: adminProcedure
    .input(z.object({ id: z.string().uuid(), newName: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const row = await findTorrentById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getQBClient();
      const files = await qb.listTorrentFiles(row.hash);
      if (files.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No files in torrent" });

      const mainFile = files.reduce((a, b) => (a.size > b.size ? a : b));
      const ext = mainFile.name.includes(".") ? mainFile.name.slice(mainFile.name.lastIndexOf(".")) : "";
      const newPath = mainFile.name.includes("/")
        ? mainFile.name.slice(0, mainFile.name.lastIndexOf("/") + 1) + input.newName + ext
        : input.newName + ext;

      await qb.renameFile(row.hash, mainFile.name, newPath);
      await updateTorrent(ctx.db, input.id, { title: input.newName });
      return { success: true };
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
