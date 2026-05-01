import { getSetting, getSettings, getSettingRaw } from "@canto/db/settings";
import {
  getByMediaIdInput,
  listMediaVersionGroupsInput,
  searchForMediaVersionInput,
  resolveMediaVersionInput,
  deleteMediaVersionInput,
  discoverServerLibrariesInput,
} from "@canto/validators";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import {
  findMediaVersionsByMediaId,
  getMediaVersionCounts,
  deleteMediaVersionById,
} from "@canto/core/infra/media/media-version-repository";
import { dispatchJellyfinSync, dispatchPlexSync, dispatchFolderScan } from "@canto/core/platform/queue/bullmq-dispatcher";

// ── Extracted use-cases & services ──
import {
  resolveMediaVersion,
  resolveMediaVersionPreview,
} from "@canto/core/domain/media/use-cases/resolve-media-version";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import { makePersistDeps } from "@canto/core/composition/persist-deps";
import { discoverServerLibraries } from "@canto/core/domain/media-servers/use-cases/discover-libraries";
import { updateMediaServerMetadata } from "@canto/core/domain/media-servers/use-cases/update-metadata";
import { getMediaAvailability } from "@canto/core/domain/media/services/media-availability-service";
import { listMediaVersionGroups } from "@canto/core/domain/media-servers/services/media-version-groups-service";
import { makeJellyfinAdapter } from "@canto/core/infra/media-servers/jellyfin.adapter-bindings";
import { makePlexAdapter } from "@canto/core/infra/media-servers/plex.adapter-bindings";
import { makeServerCredentials } from "@canto/core/infra/media-servers/server-credentials.adapter";
import { makeUserConnectionRepository } from "@canto/core/infra/media-servers/user-connection-repository.adapter";
import { makeFoldersRepository } from "@canto/core/infra/file-organization/folders-repository.adapter";
import { makeMediaVersionRepository } from "@canto/core/infra/media/media-version-repository.adapter";
import { logAndSwallow } from "@canto/core/platform/logger/console-logger.adapter";

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
      getSettingRaw("sync.mediaImport.status.jellyfin-sync") as Promise<SyncStatus | null>,
      getSettingRaw("sync.mediaImport.status.plex-sync") as Promise<SyncStatus | null>,
    ]);
    return { jellyfin: jellyfin ?? null, plex: plex ?? null };
  }),

  /**
   * Grouped view used by the admin "Sync items" dialog. Matched versions
   * cluster under their media row; unmatched orphans (media_id NULL) are
   * returned as singleton groups with media=null. Tab filter is applied at
   * the group level — e.g. "imported" matches groups where every version is
   * imported or skipped, "failed" matches groups with any failed version.
   */
  listMediaVersionGroups: protectedProcedure
    .input(listMediaVersionGroupsInput)
    .query(({ ctx, input }) =>
      listMediaVersionGroups(
        { mediaVersions: makeMediaVersionRepository(ctx.db) },
        ctx.session.user.language,
        { server: input.server, tab: input.tab, search: input.search },
        input.page,
        input.pageSize,
      ),
    ),

  getMediaVersionCounts: protectedProcedure.query(({ ctx }) =>
    getMediaVersionCounts(ctx.db),
  ),

  getServerDeepLinkConfig: adminProcedure.query(async () => {
    const {
      "plex.url": plexUrl,
      "plex.machineId": plexMachineId,
      "jellyfin.url": jellyfinUrl,
    } = await getSettings(["plex.url", "plex.machineId", "jellyfin.url"]);
    return {
      plexUrl: plexUrl ?? null,
      plexMachineId: plexMachineId ?? null,
      jellyfinUrl: jellyfinUrl ?? null,
    };
  }),

  searchForMediaVersion: protectedProcedure
    .input(searchForMediaVersionInput)
    .query(async ({ input }) => {
      const tmdb = await getTmdbProvider();
      return tmdb.search(input.query, input.type ?? "movie");
    }),

  /**
   * Dry-run preview of a resolve action — returns how many versions would
   * move and which old media rows would be garbage-collected.
   */
  getResolveMediaVersionPreview: adminProcedure
    .input(resolveMediaVersionInput)
    .query(async ({ ctx, input }) => {
      const tmdb = await getTmdbProvider();
      const persist = makePersistDeps(ctx.db);
      const mediaVersion = makeMediaVersionRepository(ctx.db);
      const scope = input.versionId
        ? { versionId: input.versionId, tmdbId: input.tmdbId, type: input.type }
        : { mediaId: input.mediaId!, tmdbId: input.tmdbId, type: input.type };
      return resolveMediaVersionPreview(
        ctx.db,
        { ...persist, mediaVersion },
        scope,
        tmdb,
      );
    }),

  resolveMediaVersion: adminProcedure
    .input(resolveMediaVersionInput)
    .mutation(async ({ ctx, input }) => {
      const tmdb = await getTmdbProvider();
      const persist = makePersistDeps(ctx.db);
      const mediaVersion = makeMediaVersionRepository(ctx.db);
      const scope = input.versionId
        ? { versionId: input.versionId, tmdbId: input.tmdbId, type: input.type }
        : { mediaId: input.mediaId!, tmdbId: input.tmdbId, type: input.type };

      const result = await resolveMediaVersion(
        ctx.db,
        { ...persist, mediaVersion },
        scope,
        tmdb,
        {
          dryRun: input.dryRun,
        },
      );

      // dryRun path → ResolutionPreview, no side-effects.
      if (input.dryRun) return result;

      const mutated = result as { mediaId: string; suggestedName: string };
      if (input.updateMediaServer && mutated.mediaId) {
        await updateMediaServerMetadata(mutated.mediaId, {
          media,
          mediaVersions: makeMediaVersionRepository(ctx.db),
          localization: makeMediaLocalizationRepository(ctx.db),
          credentials: makeServerCredentials(),
          plex: makePlexAdapter(),
          jellyfin: makeJellyfinAdapter(),
        }).catch(
          logAndSwallow("sync.resolveMediaVersion:updateMediaServerMetadata"),
        );
      }

      return result;
    }),

  deleteMediaVersion: adminProcedure
    .input(deleteMediaVersionInput)
    .mutation(async ({ ctx, input }) => {
      await deleteMediaVersionById(ctx.db, input.versionId);
      return { ok: true };
    }),

  mediaServers: protectedProcedure
    .input(getByMediaIdInput)
    .query(async ({ ctx, input }) => {
      const versions = await findMediaVersionsByMediaId(ctx.db, input.mediaId);

      const result: {
        jellyfin?: { url: string };
        plex?: { url: string };
      } = {};

      const jellyfinVersion = versions.find((v) => v.source === "jellyfin");
      if (jellyfinVersion) {
        const jellyfinUrl = await getSetting("jellyfin.url");
        if (jellyfinUrl) {
          result.jellyfin = {
            url: `${jellyfinUrl}/web/index.html#!/details?id=${jellyfinVersion.serverItemId}`,
          };
        }
      }

      const plexVersion = versions.find((v) => v.source === "plex");
      if (plexVersion) {
        const plexUrl = await getSetting("plex.url");
        const machineId = await getSetting("plex.machineId");
        if (plexUrl && machineId) {
          result.plex = {
            url: `${plexUrl}/web/index.html#!/server/${machineId}/details?key=%2Flibrary%2Fmetadata%2F${plexVersion.serverItemId}`,
          };
        }
      }

      return result;
    }),

  mediaAvailability: protectedProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) =>
      getMediaAvailability(
        { mediaVersion: makeMediaVersionRepository(ctx.db) },
        input.mediaId,
      ),
    ),

  scanFolders: adminProcedure.mutation(async () => {
    const started = await dispatchFolderScan();
    return { started };
  }),

  discoverServerLibraries: protectedProcedure
    .input(discoverServerLibrariesInput)
    .query(({ ctx, input }) =>
      discoverServerLibraries(
        input.serverType,
        {
          repo: makeUserConnectionRepository(ctx.db),
          folders: makeFoldersRepository(ctx.db),
          credentials: makeServerCredentials(),
          plex: makePlexAdapter(),
          jellyfin: makeJellyfinAdapter(),
        },
        ctx.session.user.id,
      ),
    ),
});
