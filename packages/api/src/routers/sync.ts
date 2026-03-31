import { Queue } from "bullmq";
import { z } from "zod";

import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../lib/settings-keys";
import { persistMedia } from "@canto/db/persist-media";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { getTmdbProvider } from "../lib/tmdb-client";
import {
  findSyncItemById,
  findSyncItemsByMediaId,
  findSyncItemsWithEpisodes,
  findSyncItemsPaginated,
  updateSyncItem,
} from "../infrastructure/repositories/sync-repository";
import { findMediaByAnyReference, updateMedia } from "../infrastructure/repositories/media-repository";

/* -------------------------------------------------------------------------- */
/*  Queue (lazy singleton)                                                     */
/* -------------------------------------------------------------------------- */

let reverseSyncQueue: Queue | null = null;

function getQueue(): Queue {
  if (!reverseSyncQueue) {
    reverseSyncQueue = new Queue("reverse-sync", {
      connection: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
        password: process.env.REDIS_PASSWORD ?? undefined,
      },
    });
  }
  return reverseSyncQueue;
}

/* -------------------------------------------------------------------------- */
/*  Router                                                                     */
/* -------------------------------------------------------------------------- */

export const syncRouter = createTRPCRouter({
  /**
   * Trigger a reverse sync — import media from Jellyfin/Plex into Canto.
   */
  importMedia: protectedProcedure.mutation(async () => {
    const queue = getQueue();
    const existing = await queue.getJob("reverse-sync-run");
    if (existing) {
      const state = await existing.getState();
      if (state === "active" || state === "waiting") {
        return { started: false, reason: "already-running" };
      }
      await existing.remove();
    }
    await queue.add("reverse-sync", {}, { jobId: "reverse-sync-run" });
    return { started: true };
  }),

  /**
   * Get the current status of a reverse sync job (progress counters).
   */
  importMediaStatus: publicProcedure.query(async () => {
    const status = await getSetting<{
      status: "running" | "completed" | "failed";
      total: number;
      processed: number;
      imported: number;
      skipped: number;
      failed: number;
      startedAt: string;
      completedAt?: string;
    }>(SETTINGS.SYNC_MEDIA_IMPORT_STATUS);
    return status ?? null;
  }),

  /**
   * List synced items with pagination and optional filter by result.
   */
  listSyncedItems: publicProcedure
    .input(
      z.object({
        libraryId: z.string().uuid().optional(),
        source: z.enum(["jellyfin", "plex"]).optional(),
        result: z.enum(["imported", "skipped", "failed"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ input }) => {
      const { items, total } = await findSyncItemsPaginated(
        db,
        { libraryId: input.libraryId, source: input.source, result: input.result },
        input.pageSize,
        (input.page - 1) * input.pageSize,
      );
      return { items, total, page: input.page, pageSize: input.pageSize };
    }),

  /**
   * Search TMDB for a sync item that failed to match automatically.
   */
  searchForSyncItem: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const tmdb = await getTmdbProvider();
      return tmdb.search(input.query, "movie");
    }),

  /**
   * Manually resolve a failed sync item with a specific TMDB ID.
   * Fetches metadata, persists to DB, marks as imported.
   */
  resolveSyncItem: protectedProcedure
    .input(
      z.object({
        syncItemId: z.string().uuid(),
        tmdbId: z.number().int(),
        type: z.enum(["movie", "show"]),
      }),
    )
    .mutation(async ({ input }) => {
      const item = await findSyncItemById(db, input.syncItemId);
      if (!item) throw new Error("Sync item not found");

      const tmdb = await getTmdbProvider();
      const normalized = await tmdb.getMetadata(input.tmdbId, input.type);

      // Check if media already exists by external ID
      const existing = await findMediaByAnyReference(db, input.tmdbId, "tmdb");

      let mediaId: string;
      if (existing) {
        mediaId = existing.id;
        if (!existing.inLibrary) {
          await updateMedia(db, existing.id, {
            inLibrary: true, libraryId: item.libraryId, libraryPath: item.serverItemPath, addedAt: new Date(),
          });
        }
      } else {
        const inserted = await persistMedia(db, normalized);
        await updateMedia(db, inserted.id, {
          inLibrary: true, libraryId: item.libraryId, libraryPath: item.serverItemPath, addedAt: new Date(),
        });
        mediaId = inserted.id;
      }

      await updateSyncItem(db, input.syncItemId, {
        tmdbId: input.tmdbId, mediaId, result: "imported", reason: null,
      });

      const suggestedName = `${normalized.title} (${normalized.year ?? "Unknown"}) [tmdb-${input.tmdbId}]`;
      return { mediaId, suggestedName };
    }),

  /**
   * Get which media servers have a given media item, with deep links.
   */
  mediaServers: publicProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ input }) => {
      const items = await findSyncItemsByMediaId(db, input.mediaId);

      const result: {
        jellyfin?: { url: string };
        plex?: { url: string };
      } = {};

      const jellyfinItem = items.find((i) => i.source === "jellyfin" && i.jellyfinItemId);
      if (jellyfinItem) {
        const jellyfinUrl = await getSetting<string>(SETTINGS.JELLYFIN_URL);
        if (jellyfinUrl) {
          result.jellyfin = {
            url: `${jellyfinUrl}/web/index.html#!/details?id=${jellyfinItem.jellyfinItemId}`,
          };
        }
      }

      const plexItem = items.find((i) => i.source === "plex" && i.plexRatingKey);
      if (plexItem) {
        const plexUrl = await getSetting<string>(SETTINGS.PLEX_URL);
        const machineId = await getSetting<string>(SETTINGS.PLEX_MACHINE_ID);
        if (plexUrl && machineId) {
          result.plex = {
            url: `${plexUrl}/web/index.html#!/server/${machineId}/details?key=%2Flibrary%2Fmetadata%2F${plexItem.plexRatingKey}`,
          };
        }
      }

      return result;
    }),

  /**
   * Get media availability across all sources (downloads, Jellyfin, Plex).
   * Returns source-level info + episode-level availability for shows.
   */
  mediaAvailability: publicProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ input }) => {
      const items = await findSyncItemsWithEpisodes(db, input.mediaId);

      const sources: Array<{
        type: "jellyfin" | "plex";
        resolution?: string | null;
        videoCodec?: string | null;
        episodeCount?: number;
      }> = [];

      // Episode-level map: "S01E05" → [{ type, resolution }]
      const episodeMap: Record<string, Array<{ type: string; resolution?: string | null }>> = {};

      for (const item of items) {
        if (!item.source) continue;
        const srcType = item.source as "jellyfin" | "plex";

        if (item.episodes.length === 0) continue;

        // For movies: single episode entry with no season/episode number
        const movieEp = item.episodes.find((e) => e.seasonNumber == null && e.episodeNumber == null);
        if (movieEp) {
          sources.push({
            type: srcType,
            resolution: movieEp.resolution,
            videoCodec: movieEp.videoCodec,
          });
          continue;
        }

        // For shows
        sources.push({
          type: srcType,
          resolution: item.episodes[0]?.resolution, // most common resolution
          videoCodec: item.episodes[0]?.videoCodec,
          episodeCount: item.episodes.length,
        });

        for (const ep of item.episodes) {
          if (ep.seasonNumber == null || ep.episodeNumber == null) continue;
          const key = `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
          if (!episodeMap[key]) episodeMap[key] = [];
          episodeMap[key].push({ type: srcType, resolution: ep.resolution });
        }
      }

      return { sources, episodes: episodeMap };
    }),
});
