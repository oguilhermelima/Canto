import { Queue } from "bullmq";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@canto/db/client";
import { library, media, syncItem, syncEpisode } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import { persistMedia } from "@canto/db/persist-media";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { getTmdbProvider } from "../lib/tmdb-client";

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
    }>("sync.mediaImport.status");
    return status ?? null;
  }),

  /**
   * List synced items with pagination and optional filter by result.
   */
  listSyncedItems: publicProcedure
    .input(
      z.object({
        libraryId: z.string().uuid().optional(),
        result: z.enum(["imported", "skipped", "failed"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input.libraryId) conditions.push(eq(syncItem.libraryId, input.libraryId));
      if (input.result) conditions.push(eq(syncItem.result, input.result));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [total]] = await Promise.all([
        db
          .select()
          .from(syncItem)
          .where(where)
          .orderBy(
            // Failed first, then imported, then skipped
            desc(eq(syncItem.result, "failed")),
            desc(eq(syncItem.result, "imported")),
            syncItem.serverItemTitle,
          )
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        db.select({ count: count() }).from(syncItem).where(where),
      ]);

      return {
        items,
        total: total?.count ?? 0,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Search TMDB for a sync item that failed to match automatically.
   */
  searchForSyncItem: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const tmdb = await getTmdbProvider();
      return tmdb.search(input.query, {});
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
      const item = await db.query.syncItem.findFirst({
        where: eq(syncItem.id, input.syncItemId),
      });
      if (!item) throw new Error("Sync item not found");

      const tmdb = await getTmdbProvider();
      const normalized = await tmdb.getMetadata(input.tmdbId, input.type);

      // Check if media already exists
      let existingMedia = await db.query.media.findFirst({
        where: and(eq(media.externalId, input.tmdbId), eq(media.provider, "tmdb")),
      });

      if (existingMedia) {
        if (!existingMedia.inLibrary) {
          await db
            .update(media)
            .set({ inLibrary: true, libraryId: item.libraryId, libraryPath: item.serverItemPath, addedAt: new Date() })
            .where(eq(media.id, existingMedia.id));
        }
      } else {
        const inserted = await persistMedia(db, normalized);
        await db
          .update(media)
          .set({ inLibrary: true, libraryId: item.libraryId, libraryPath: item.serverItemPath, addedAt: new Date() })
          .where(eq(media.id, inserted.id));
        existingMedia = inserted;
      }

      // Update sync item
      await db
        .update(syncItem)
        .set({
          tmdbId: input.tmdbId,
          mediaId: existingMedia.id,
          result: "imported",
          reason: null,
        })
        .where(eq(syncItem.id, input.syncItemId));

      // Suggest a rename path
      const suggestedName = `${normalized.title} (${normalized.year ?? "Unknown"}) [tmdb-${input.tmdbId}]`;

      return { mediaId: existingMedia.id, suggestedName };
    }),

  /**
   * Get which media servers have a given media item, with deep links.
   */
  mediaServers: publicProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ input }) => {
      const items = await db
        .select({
          source: syncItem.source,
          jellyfinItemId: syncItem.jellyfinItemId,
          plexRatingKey: syncItem.plexRatingKey,
        })
        .from(syncItem)
        .where(eq(syncItem.mediaId, input.mediaId));

      const result: {
        jellyfin?: { url: string };
        plex?: { url: string };
      } = {};

      const jellyfinItem = items.find((i) => i.source === "jellyfin" && i.jellyfinItemId);
      if (jellyfinItem) {
        const jellyfinUrl = await getSetting<string>("jellyfin.url");
        if (jellyfinUrl) {
          result.jellyfin = {
            url: `${jellyfinUrl}/web/index.html#!/details?id=${jellyfinItem.jellyfinItemId}`,
          };
        }
      }

      const plexItem = items.find((i) => i.source === "plex" && i.plexRatingKey);
      if (plexItem) {
        const plexUrl = await getSetting<string>("plex.url");
        if (plexUrl) {
          // Try to get machine ID for app.plex.tv deep link
          try {
            const identityRes = await fetch(`${plexUrl}/identity`, {
              headers: { Accept: "application/json", "X-Plex-Token": (await getSetting<string>("plex.token")) ?? "" },
            });
            if (identityRes.ok) {
              const identity = await identityRes.json() as { MediaContainer: { machineIdentifier: string } };
              const machineId = identity.MediaContainer.machineIdentifier;
              result.plex = {
                url: `https://app.plex.tv/desktop/#!/server/${machineId}/details?key=%2Flibrary%2Fmetadata%2F${plexItem.plexRatingKey}`,
              };
            }
          } catch {
            // Fallback to local URL
            result.plex = {
              url: `${plexUrl}/web/index.html#!/server/details?key=%2Flibrary%2Fmetadata%2F${plexItem.plexRatingKey}`,
            };
          }
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
      // Get sync items with their episodes for this media
      const items = await db.query.syncItem.findMany({
        where: eq(syncItem.mediaId, input.mediaId),
        with: { episodes: true },
      });

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
