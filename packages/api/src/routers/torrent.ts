import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { library, media, mediaFile, torrent } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import { torrentDownloadInput, torrentSearchInput } from "@canto/validators";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { detectQuality, detectSource } from "../domain/rules/quality";
import { parseSeasons, parseEpisodes } from "../domain/rules/parsing";
import { getQBClient } from "../infrastructure/adapters/qbittorrent";
import { autoImportTorrent } from "../domain/use-cases/import-torrent";
import { mergeLiveData } from "../domain/use-cases/merge-live-data";
import { searchTorrents } from "../domain/use-cases/search-torrents";
import { downloadTorrent, replaceTorrent } from "../domain/use-cases/download-torrent";

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const torrentRouter = createTRPCRouter({
  /**
   * Search for torrents via Prowlarr/Jackett, building a search query from the
   * media item's title (+ season number if provided).
   */
  search: protectedProcedure
    .input(torrentSearchInput)
    .query(({ ctx, input }) => searchTorrents(ctx.db, input)),

  /**
   * Send a magnet/torrent URL to qBittorrent and create a torrent DB record.
   * Pre-associates media_file placeholders so we know what episodes are
   * covered BEFORE the download completes.
   */
  download: publicProcedure
    .input(torrentDownloadInput)
    .mutation(({ ctx, input }) => downloadTorrent(ctx.db, input)),

  /**
   * Replace existing media_file records and re-download with a new torrent.
   * Deletes the specified old files, then runs the standard download flow.
   */
  replace: publicProcedure
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
  retry: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      }

      const url = row.magnetUrl ?? row.downloadUrl;
      if (!url) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No download URL saved for this torrent. Please search and download again.",
        });
      }

      // Resolve category from linked media's library assignment
      const linkedMedia = row.mediaId
        ? await ctx.db.query.media.findFirst({
            where: eq(media.id, row.mediaId),
            columns: { type: true, libraryId: true },
          })
        : null;

      let retryCategory: string;
      if (linkedMedia?.libraryId) {
        const assignedLib = await ctx.db.query.library.findFirst({
          where: eq(library.id, linkedMedia.libraryId),
          columns: { qbitCategory: true },
        });
        retryCategory = assignedLib?.qbitCategory ?? (linkedMedia.type === "show" ? "shows" : "movies");
      } else {
        const mediaType = linkedMedia?.type === "show" ? "shows" : "movies";
        const defaultLib = await ctx.db.query.library.findFirst({
          where: and(eq(library.type, mediaType), eq(library.isDefault, true)),
          columns: { qbitCategory: true },
        });
        retryCategory = defaultLib?.qbitCategory ?? mediaType;
      }

      const qb = await getQBClient();
      await qb.addTorrent(url, retryCategory);

      // Try to get the new hash
      let newHash = row.hash;
      if (!newHash && url.startsWith("magnet:")) {
        const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(url);
        if (match?.[1]) newHash = match[1].toLowerCase();
      }

      const [updated] = await ctx.db
        .update(torrent)
        .set({
          hash: newHash,
          status: "downloading",
          progress: 0,
          updatedAt: new Date(),
        })
        .where(eq(torrent.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * List all torrent records from the database.
   */
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.torrent.findMany({
      orderBy: (t, { desc: d }) => [d(t.createdAt)],
    });
  }),

  /**
   * List torrents for a specific media item.
   */
  listByMedia: publicProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.torrent.findMany({
        where: eq(torrent.mediaId, input.mediaId),
        orderBy: (t, { desc: d }) => [d(t.createdAt)],
      });
    }),

  /**
   * List live torrent data from qBittorrent merged with DB records + media info.
   */
  listLive: publicProcedure.query(async ({ ctx }) => {
    const dbRows = await ctx.db.query.torrent.findMany({
      orderBy: (t, { desc: d }) => [d(t.createdAt)],
    });

    // Fetch media info for all linked torrents
    const mediaIds = [...new Set(dbRows.map((r) => r.mediaId).filter(Boolean))] as string[];
    const mediaRows = mediaIds.length > 0
      ? await ctx.db.query.media.findMany({
          columns: { id: true, title: true, posterPath: true, type: true, year: true },
        })
      : [];
    const mediaMap = new Map(mediaRows.map((m) => [m.id, m]));

    const merged = await mergeLiveData(ctx.db, dbRows);

    return merged.map((item) => {
      const linkedMedia = item.row.mediaId ? mediaMap.get(item.row.mediaId) : undefined;
      return {
        ...item.row,
        media: linkedMedia
          ? {
              id: linkedMedia.id,
              title: linkedMedia.title,
              posterPath: linkedMedia.posterPath,
              type: linkedMedia.type,
              year: linkedMedia.year,
            }
          : null,
        live: item.live,
      };
    });
  }),

  /**
   * List live torrent data for a specific media, merged with qBittorrent.
   */
  listLiveByMedia: publicProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const dbRows = await ctx.db.query.torrent.findMany({
        where: eq(torrent.mediaId, input.mediaId),
        orderBy: (t, { desc: d }) => [d(t.createdAt)],
      });

      if (dbRows.length === 0) return [];

      const merged = await mergeLiveData(ctx.db, dbRows);

      return merged.map((item) => ({
        ...item.row,
        live: item.live,
      }));
    }),

  /**
   * Pause a torrent in qBittorrent.
   */
  pause: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      }

      if (row.hash) {
        const qb = await getQBClient();
        await qb.pauseTorrent(row.hash);
      }

      const [updated] = await ctx.db
        .update(torrent)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(torrent.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Resume a paused torrent in qBittorrent.
   */
  resume: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      }

      if (row.hash) {
        const qb = await getQBClient();
        await qb.resumeTorrent(row.hash);
      }

      const [updated] = await ctx.db
        .update(torrent)
        .set({ status: "downloading", updatedAt: new Date() })
        .where(eq(torrent.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Cancel (pause) a torrent in qBittorrent (legacy).
   */
  cancel: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      }

      if (row.hash) {
        const qb = await getQBClient();
        await qb.pauseTorrent(row.hash);
      }

      const [updated] = await ctx.db
        .update(torrent)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(torrent.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Trigger import for a completed torrent — organizes files and triggers Jellyfin scan.
   */
  import: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      }

      if (row.imported) {
        return { success: true, message: "Already imported" };
      }

      if (row.importing) {
        return { success: true, message: "Import already in progress" };
      }

      if (row.status !== "completed" || !row.hash || !row.mediaId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Torrent must be completed and linked to a media item to import",
        });
      }

      // Atomically set importing = true
      const [claimed] = await ctx.db
        .update(torrent)
        .set({ importing: true })
        .where(and(eq(torrent.id, row.id), eq(torrent.importing, false)))
        .returning();

      if (!claimed) {
        return { success: true, message: "Import already in progress" };
      }

      try {
        const qb = await getQBClient();
        await autoImportTorrent(ctx.db, claimed, qb);
        return { success: true };
      } catch (err) {
        // Reset importing flag so it can retry
        await ctx.db.update(torrent).set({ importing: false }).where(eq(torrent.id, row.id));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Import failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Delete a torrent record from DB and optionally from qBittorrent.
   */
  delete: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        deleteFiles: z.boolean().default(false),
        removeTorrent: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Torrent not found",
        });
      }

      // Remove from qBittorrent if requested and hash is known
      if (input.removeTorrent && row.hash) {
        try {
          const qb = await getQBClient();
          await qb.deleteTorrent(row.hash, input.deleteFiles);
        } catch {
          // qBittorrent may not have this torrent anymore — that is okay
        }
      }

      await ctx.db.delete(torrent).where(eq(torrent.id, input.id));

      return { success: true };
    }),

  /**
   * Rename a torrent's file in qBittorrent.
   */
  rename: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        newName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getQBClient();
      const files = await qb.listTorrentFiles(row.hash);
      if (files.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No files in torrent" });

      // Rename the main video file (largest file)
      const mainFile = files.reduce((a, b) => (a.size > b.size ? a : b));
      const ext = mainFile.name.includes(".") ? mainFile.name.slice(mainFile.name.lastIndexOf(".")) : "";
      const newPath = mainFile.name.includes("/")
        ? mainFile.name.slice(0, mainFile.name.lastIndexOf("/") + 1) + input.newName + ext
        : input.newName + ext;

      await qb.renameFile(row.hash, mainFile.name, newPath);

      // Update DB title
      await ctx.db
        .update(torrent)
        .set({ title: input.newName, updatedAt: new Date() })
        .where(eq(torrent.id, input.id));

      return { success: true };
    }),

  /**
   * Move a torrent's files to a new location in qBittorrent.
   */
  move: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        newPath: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Torrent not found" });
      if (!row.hash) throw new TRPCError({ code: "BAD_REQUEST", message: "Torrent has no hash" });

      const qb = await getQBClient();
      await qb.setLocation(row.hash, input.newPath);

      // Update DB content path
      await ctx.db
        .update(torrent)
        .set({ contentPath: input.newPath, updatedAt: new Date() })
        .where(eq(torrent.id, input.id));

      return { success: true };
    }),
});
