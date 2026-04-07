import { getSetting } from "@canto/db/settings";
import {
  getByMediaIdInput,
  listSyncedItemsInput,
  searchForSyncItemInput,
  resolveSyncItemInput,
  discoverServerLibrariesInput,
} from "@canto/validators";
import { SETTINGS } from "@canto/core/lib/settings-keys";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import {
  findSyncItemsByMediaId,
  findSyncItemsPaginated,
} from "@canto/core/infrastructure/repositories/sync-repository";
import { dispatchJellyfinSync, dispatchPlexSync, dispatchFolderScan } from "@canto/core/infrastructure/queue/bullmq-dispatcher";

// ── Extracted use-cases & services ──
import { resolveSyncItem } from "@canto/core/domain/use-cases/resolve-sync-item";
import { discoverServerLibraries } from "@canto/core/domain/use-cases/discover-server-libraries";
import { getMediaAvailability } from "@canto/core/domain/services/media-availability-service";

/* -------------------------------------------------------------------------- */
/*  Router                                                                     */
/* -------------------------------------------------------------------------- */

export const syncRouter = createTRPCRouter({
  importMedia: adminProcedure.mutation(async () => {
    const [jellyfin, plex] = await Promise.all([
      dispatchJellyfinSync(),
      dispatchPlexSync(),
    ]);
    return { started: { jellyfin, plex } };
  }),

  syncJellyfin: adminProcedure.mutation(async () => {
    const started = await dispatchJellyfinSync();
    return { started };
  }),

  syncPlex: adminProcedure.mutation(async () => {
    const started = await dispatchPlexSync();
    return { started };
  }),

  importMediaStatus: protectedProcedure.query(async () => {
    type SyncStatus = {
      status: "running" | "completed" | "failed";
      total: number; processed: number; imported: number;
      skipped: number; failed: number;
      startedAt: string; completedAt?: string;
    };
    const [jellyfin, plex] = await Promise.all([
      getSetting<SyncStatus>(`${SETTINGS.SYNC_MEDIA_IMPORT_STATUS}.jellyfin-sync`),
      getSetting<SyncStatus>(`${SETTINGS.SYNC_MEDIA_IMPORT_STATUS}.plex-sync`),
    ]);
    return { jellyfin: jellyfin ?? null, plex: plex ?? null };
  }),

  listSyncedItems: protectedProcedure
    .input(listSyncedItemsInput)
    .query(async ({ ctx, input }) => {
      const { items, total } = await findSyncItemsPaginated(
        ctx.db,
        { libraryId: input.libraryId, source: input.source, result: input.result },
        input.pageSize,
        (input.page - 1) * input.pageSize,
      );
      return { items, total, page: input.page, pageSize: input.pageSize };
    }),

  searchForSyncItem: protectedProcedure
    .input(searchForSyncItemInput)
    .query(async ({ input }) => {
      const tmdb = await getTmdbProvider();
      return tmdb.search(input.query, "movie");
    }),

  resolveSyncItem: adminProcedure
    .input(resolveSyncItemInput)
    .mutation(async ({ ctx, input }) => {
      const tmdb = await getTmdbProvider();
      return resolveSyncItem(ctx.db, input, tmdb);
    }),

  mediaServers: protectedProcedure
    .input(getByMediaIdInput)
    .query(async ({ ctx, input }) => {
      const items = await findSyncItemsByMediaId(ctx.db, input.mediaId);

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

  mediaAvailability: protectedProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) => getMediaAvailability(ctx.db, input.mediaId)),

  scanFolders: adminProcedure.mutation(async () => {
    const started = await dispatchFolderScan();
    return { started };
  }),

  discoverServerLibraries: adminProcedure
    .input(discoverServerLibrariesInput)
    .query(({ ctx, input }) => discoverServerLibraries(ctx.db, input.serverType)),
});
