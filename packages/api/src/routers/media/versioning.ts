import { TRPCError } from "@trpc/server";

import type { MediaType, ProviderName } from "@canto/providers";
import {
  setOverrideProviderInput,
  applyProviderOverrideInput,
} from "@canto/validators";

import { createTRPCRouter, adminProcedure } from "../../trpc";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getTvdbProvider } from "@canto/core/platform/http/tvdb-client";
import {
  findMediaById,
  findMediaByIdWithSeasons,
  updateMedia,
} from "@canto/core/infra/media/media-repository";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { makeMediaLocalizationRepository } from "@canto/core/infra/media/media-localization-repository.adapter";
import { findMediaFilesByMediaId } from "@canto/core/infra/media/media-file-repository";
import { findMediaVersionsByMediaId } from "@canto/core/infra/media/media-version-repository";
import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";
import { persistFullMedia } from "@canto/core/domain/media/use-cases/persist/core";
import { fetchMediaMetadata } from "@canto/core/domain/media/use-cases/fetch-media-metadata";
import { getEffectiveProvider } from "@canto/core/domain/shared/rules/effective-provider";
import { reconcileShowStructure } from "@canto/core/domain/media/use-cases/reconcile-show-structure";
import { jobDispatcher } from "@canto/core/platform/queue/job-dispatcher.adapter";
import { makeConsoleLogger } from "@canto/core/platform/logger/console-logger.adapter";
import { executeReorganizeMediaFiles } from "@canto/core/domain/file-organization/use-cases/reorganize-media-files";
import { createNodeFileSystemAdapter } from "@canto/core/platform/fs/filesystem";
import { updateMediaServerMetadata } from "@canto/core/domain/media-servers/use-cases/update-metadata";
import { makeJellyfinAdapter } from "@canto/core/infra/media-servers/jellyfin.adapter-bindings";
import { makePlexAdapter } from "@canto/core/infra/media-servers/plex.adapter-bindings";

export const mediaVersioningRouter = createTRPCRouter({
  previewProviderOverride: adminProcedure
    .input(setOverrideProviderInput)
    .query(async ({ ctx, input }) => {
      const row = await findMediaByIdWithSeasons(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      if (row.type !== "show") throw new TRPCError({ code: "BAD_REQUEST", message: "Provider override only applies to shows" });

      const currentSeasons = row.seasons.filter((s: { number: number }) => s.number > 0);
      const mediaFiles = await findMediaFilesByMediaId(ctx.db, input.id);
      const versions = await findMediaVersionsByMediaId(ctx.db, input.id);

      return {
        currentSeasonCount: currentSeasons.length,
        fileCount: mediaFiles.length,
        hasMediaServer: versions.length > 0,
      };
    }),

  applyProviderOverride: adminProcedure
    .input(applyProviderOverrideInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findMediaById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      if (row.type !== "show") throw new TRPCError({ code: "BAD_REQUEST", message: "Provider override only applies to shows" });

      await updateMedia(ctx.db, input.id, { overrideProviderFor: input.overrideProviderFor });

      const effectiveProvider = await getEffectiveProvider({ ...row, overrideProviderFor: input.overrideProviderFor });

      if (effectiveProvider === "tvdb") {
        const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
        const media = makeMediaRepository(ctx.db);
        await reconcileShowStructure(
          ctx.db,
          {
            media,
            localization: makeMediaLocalizationRepository(ctx.db),
            tmdb,
            tvdb,
            dispatcher: jobDispatcher,
            logger: makeConsoleLogger(),
          },
          input.id,
          { force: true },
        );
      } else {
        const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
        const supportedLangs = [...await getActiveUserLanguages(ctx.db)];

        const result = await fetchMediaMetadata(
          row.externalId, row.provider as ProviderName, row.type as MediaType,
          { tmdb, tvdb },
          { reprocess: true, useTVDBSeasons: false, supportedLanguages: supportedLangs },
        );
        await persistFullMedia(ctx.db, result, row.id);
      }

      if (input.renameFiles) {
        await executeReorganizeMediaFiles(ctx.db, input.id, { fs: createNodeFileSystemAdapter() });
      }

      if (input.updateMediaServer) {
        await updateMediaServerMetadata(ctx.db, input.id, {
          plex: makePlexAdapter(),
          jellyfin: makeJellyfinAdapter(),
        });
      }

      return findMediaById(ctx.db, input.id);
    }),
});
