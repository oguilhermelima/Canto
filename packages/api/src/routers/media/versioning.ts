import { TRPCError } from "@trpc/server";

import type { MediaType, ProviderName } from "@canto/providers";
import {
  setOverrideProviderInput,
  applyProviderOverrideInput,
} from "@canto/validators";

import { createTRPCRouter, adminProcedure } from "../../trpc";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import { getTvdbProvider } from "@canto/core/lib/tvdb-client";
import {
  findMediaById,
  findMediaByIdWithSeasons,
  updateMedia,
} from "@canto/core/infrastructure/repositories/media/media-repository";
import { findMediaFilesByMediaId } from "@canto/core/infrastructure/repositories/media/media-file-repository";
import { findMediaVersionsByMediaId } from "@canto/core/infrastructure/repositories/media/media-version-repository";
import { getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";
import { persistFullMedia } from "@canto/core/domain/use-cases/media/persist/core";
import { fetchMediaMetadata } from "@canto/core/domain/use-cases/media/fetch-media-metadata";
import { getEffectiveProvider } from "@canto/core/domain/shared/rules/effective-provider";
import { reconcileShowStructure } from "@canto/core/domain/use-cases/media/reconcile-show-structure";
import { jobDispatcher } from "@canto/core/infrastructure/adapters/job-dispatcher.adapter";
import { executeReorganizeMediaFiles } from "@canto/core/domain/use-cases/file-organization/reorganize-media-files";
import { createNodeFileSystemAdapter } from "@canto/core/infrastructure/adapters/filesystem";
import { updateMediaServerMetadata } from "@canto/core/domain/use-cases/media-servers/update-metadata";

export const mediaVersioningRouter = createTRPCRouter({
  previewProviderOverride: adminProcedure
    .input(setOverrideProviderInput)
    .query(async ({ ctx, input }) => {
      const row = await findMediaByIdWithSeasons(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      if (row.type !== "show") throw new TRPCError({ code: "BAD_REQUEST", message: "Provider override only applies to shows" });

      const currentSeasons = (row.seasons ?? []).filter((s: { number: number }) => s.number > 0);
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
        await reconcileShowStructure(ctx.db, input.id, { tmdb, tvdb, dispatcher: jobDispatcher }, { force: true });
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
        await updateMediaServerMetadata(ctx.db, input.id);
      }

      return findMediaById(ctx.db, input.id);
    }),
});
