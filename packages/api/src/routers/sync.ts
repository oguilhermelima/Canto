import { z } from "zod";

import { db } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../lib/settings-keys";
import { persistMedia, getSupportedLanguageCodes } from "@canto/db/persist-media";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import { getTmdbProvider } from "../lib/tmdb-client";
import {
  findSyncItemById,
  findSyncItemsByMediaId,
  findSyncItemsWithEpisodes,
  findSyncItemsPaginated,
  updateSyncItem,
} from "../infrastructure/repositories/sync-repository";
import { findAllServerLinks, findAllFolders } from "../infrastructure/repositories/folder-repository";
import { findMediaByAnyReference, updateMedia } from "../infrastructure/repositories/media-repository";
import { dispatchJellyfinSync, dispatchPlexSync, dispatchFolderScan } from "../infrastructure/queue/bullmq-dispatcher";
import { getJellyfinCredentials, getPlexCredentials } from "../lib/server-credentials";
import { getJellyfinLibraryFolders } from "../infrastructure/adapters/jellyfin";
import { getPlexSections } from "../infrastructure/adapters/plex";

/* -------------------------------------------------------------------------- */
/*  Router                                                                     */
/* -------------------------------------------------------------------------- */

export const syncRouter = createTRPCRouter({
  /**
   * Trigger sync for both Jellyfin and Plex.
   */
  importMedia: adminProcedure.mutation(async () => {
    const [jellyfin, plex] = await Promise.all([
      dispatchJellyfinSync(),
      dispatchPlexSync(),
    ]);
    return { started: { jellyfin, plex } };
  }),

  /** Trigger Jellyfin sync only */
  syncJellyfin: adminProcedure.mutation(async () => {
    const started = await dispatchJellyfinSync();
    return { started };
  }),

  /** Trigger Plex sync only */
  syncPlex: adminProcedure.mutation(async () => {
    const started = await dispatchPlexSync();
    return { started };
  }),

  /**
   * Get the current status of sync jobs (per-source progress counters).
   */
  importMediaStatus: protectedProcedure.query(async () => {
    type SyncStatus = {
      status: "running" | "completed" | "failed";
      total: number;
      processed: number;
      imported: number;
      skipped: number;
      failed: number;
      startedAt: string;
      completedAt?: string;
    };
    const [jellyfin, plex] = await Promise.all([
      getSetting<SyncStatus>(`${SETTINGS.SYNC_MEDIA_IMPORT_STATUS}.jellyfin-sync`),
      getSetting<SyncStatus>(`${SETTINGS.SYNC_MEDIA_IMPORT_STATUS}.plex-sync`),
    ]);
    return { jellyfin: jellyfin ?? null, plex: plex ?? null };
  }),

  /**
   * List synced items with pagination and optional filter by result.
   */
  listSyncedItems: protectedProcedure
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
  searchForSyncItem: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const tmdb = await getTmdbProvider();
      return tmdb.search(input.query, "movie");
    }),

  /**
   * Manually resolve a failed sync item with a specific TMDB ID.
   * Fetches metadata, persists to DB, marks as imported.
   */
  resolveSyncItem: adminProcedure
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
      const supportedLangs = [...await getSupportedLanguageCodes(db)];
      const normalized = await tmdb.getMetadata(input.tmdbId, input.type, { supportedLanguages: supportedLangs });

      // Check if media already exists by external ID
      const existing = await findMediaByAnyReference(db, input.tmdbId, "tmdb");

      let mediaId: string;
      if (existing) {
        mediaId = existing.id;
        if (!existing.inLibrary || !existing.downloaded) {
          await updateMedia(db, existing.id, {
            inLibrary: true, downloaded: true, libraryId: item.libraryId, libraryPath: item.serverItemPath, addedAt: existing.addedAt ?? new Date(),
          });
        }
      } else {
        const inserted = await persistMedia(db, normalized);
        await updateMedia(db, inserted.id, {
          inLibrary: true, downloaded: true, libraryId: item.libraryId, libraryPath: item.serverItemPath, addedAt: new Date(),
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
  mediaServers: protectedProcedure
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
  mediaAvailability: protectedProcedure
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

  /**
   * Trigger an on-demand folder scan (scan library paths for existing media).
   */
  scanFolders: adminProcedure.mutation(async () => {
    const started = await dispatchFolderScan();
    return { started };
  }),

  /**
   * Discover server libraries and their link status.
   * Fetches libraries from the server and joins with existing folder_server_link rows.
   */
  discoverServerLibraries: adminProcedure
    .input(z.object({ serverType: z.enum(["jellyfin", "plex"]) }))
    .query(async ({ input }) => {
      const { serverType } = input;

      type DiscoveredLibrary = {
        serverType: string;
        serverLibraryId: string;
        serverLibraryName: string;
        contentType: string;
        serverPath: string | null;
        linkId?: string;
        linkedFolderId?: string;
        linkedFolderName?: string;
        syncEnabled: boolean;
        lastSyncedAt: Date | null;
      };

      let serverLibraries: Array<{
        id: string;
        name: string;
        contentType: string;
        path: string | null;
      }>;

      if (serverType === "jellyfin") {
        const creds = await getJellyfinCredentials();
        if (!creds) return [];
        const folders = await getJellyfinLibraryFolders(creds.url, creds.apiKey);
        serverLibraries = folders.map((f) => ({
          id: f.Id,
          name: f.Name,
          contentType: f.CollectionType === "movies" ? "movies" : "shows",
          path: f.Locations[0] ?? null,
        }));
      } else {
        const creds = await getPlexCredentials();
        if (!creds) return [];
        const sections = await getPlexSections(creds.url, creds.token);
        serverLibraries = sections.map((s) => ({
          id: s.key,
          name: s.title,
          contentType: s.type === "movie" ? "movies" : "shows",
          path: s.Location[0]?.path ?? null,
        }));
      }

      const existingLinks = await findAllServerLinks(db, serverType);
      const folders = await findAllFolders(db);
      const folderMap = new Map(folders.map((f) => [f.id, f]));
      const linkMap = new Map(existingLinks.map((l) => [l.serverLibraryId, l]));

      const result: DiscoveredLibrary[] = serverLibraries.map((lib) => {
        const link = linkMap.get(lib.id);
        const folder = link ? folderMap.get(link.folderId) : undefined;
        return {
          serverType,
          serverLibraryId: lib.id,
          serverLibraryName: lib.name,
          contentType: link?.contentType ?? lib.contentType,
          serverPath: lib.path,
          linkId: link?.id,
          linkedFolderId: link?.folderId,
          linkedFolderName: folder?.name,
          syncEnabled: link?.syncEnabled ?? false,
          lastSyncedAt: link?.lastSyncedAt ?? null,
        };
      });

      return result;
    }),
});
