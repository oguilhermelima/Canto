import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";

import type { MediaType, ProviderName } from "@canto/providers";
import { season } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import {
  getByExternalInput,
  getByIdInput,
  resolveMediaInput,
} from "@canto/validators";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";
import { getTvdbProvider } from "@canto/core/platform/http/tvdb-client";
import { dispatchEnsureMedia } from "@canto/core/platform/queue/bullmq-dispatcher";
import { logAndSwallow } from "@canto/core/platform/logger/log-error";
import {
  findMediaById,
  findMediaByIdWithSeasons,
} from "@canto/core/infra/media/media-repository";
import {
  applyMediaLocalizationOverlay,
  applySeasonsLocalizationOverlay,
} from "@canto/core/domain/shared/localization/localization-service";
import { getUserLanguage, getActiveUserLanguages } from "@canto/core/domain/shared/services/user-service";
import { loadExtrasFromDB } from "@canto/core/domain/media/services/extras-service";
import { getByExternal } from "@canto/core/domain/media/use-cases/get-by-external";
import {
  resolveMedia,
  persistMediaUseCase,
  persistFullMedia,
} from "@canto/core/domain/media/use-cases/persist/core";
import { fetchMediaMetadata } from "@canto/core/domain/media/use-cases/fetch-media-metadata";
import { getEffectiveProvider } from "@canto/core/domain/shared/rules/effective-provider";
import { reconcileShowStructure } from "@canto/core/domain/media/use-cases/reconcile-show-structure";
import { jobDispatcher } from "@canto/core/platform/queue/job-dispatcher.adapter";

async function getProviderWithKey(name: "tmdb" | "tvdb") {
  if (name === "tmdb") return getTmdbProvider();
  return getTvdbProvider();
}

export const mediaMetadataRouter = createTRPCRouter({
  getById: protectedProcedure.input(getByIdInput).query(async ({ ctx, input }) => {
    const row = await findMediaByIdWithSeasons(ctx.db, input.id);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });

    const userLang = await getUserLanguage(ctx.db, ctx.session.user.id);
    const localized = await applyMediaLocalizationOverlay(ctx.db, row, userLang);
    if (localized.seasons && localized.seasons.length > 0) {
      const overlayedSeasons = await applySeasonsLocalizationOverlay(
        ctx.db,
        row.id,
        localized.seasons,
        userLang,
      );
      return { ...localized, seasons: overlayedSeasons };
    }
    return localized;
  }),

  getByExternal: protectedProcedure
    .input(getByExternalInput)
    .query(async ({ ctx, input }) => {
      const result = await getByExternal(
        ctx.db, input, ctx.session.user.id,
        getProviderWithKey,
        () => getActiveUserLanguages(ctx.db).then((s) => [...s]),
      );
      return result;
    }),

  resolve: protectedProcedure
    .input(resolveMediaInput)
    .query(async ({ ctx, input }) => {
      const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
      return resolveMedia(ctx.db, input, ctx.session.user.id, { tmdb, tvdb });
    }),

  persist: protectedProcedure
    .input(resolveMediaInput)
    .mutation(async ({ ctx, input }) => {
      const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
      return persistMediaUseCase(ctx.db, input, { tmdb, tvdb });
    }),

  getExtras: publicProcedure
    .input(getByIdInput)
    .query(async ({ ctx, input }) => {
      const row = await findMediaById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });

      const settingsLang = (await getSetting("general.language")) ?? "en-US";
      const extras = await loadExtrasFromDB(ctx.db, input.id, settingsLang);

      // If extras tables have data, return them
      if (extras.credits.cast.length > 0 || extras.videos.length > 0) {
        return extras;
      }

      // New tables empty — dispatch background refresh and fetch from TMDB directly
      void dispatchEnsureMedia(input.id, { aspects: ["extras"] }).catch(
        logAndSwallow("media:getExtras dispatchEnsureMedia(extras)"),
      );

      const tmdb = await getTmdbProvider();
      let tmdbExternalId = row.externalId;
      if (row.provider !== "tmdb" && row.imdbId) {
        try {
          const found = await tmdb.findByImdbId(row.imdbId);
          if (found.length > 0) tmdbExternalId = found[0]!.externalId;
        } catch { /* use original ID as fallback */ }
      }
      return tmdb.getExtras(tmdbExternalId, row.type as "movie" | "show");
    }),

  updateMetadata: protectedProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const row = await findMediaById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });

      const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
      const effectiveProvider = await getEffectiveProvider(row);
      const supportedLangs = [...await getActiveUserLanguages(ctx.db)];

      const result = await fetchMediaMetadata(
        row.externalId, row.provider as ProviderName, row.type as MediaType,
        { tmdb, tvdb },
        { reprocess: true, useTVDBSeasons: effectiveProvider === "tvdb", supportedLanguages: supportedLangs },
      );

      await persistFullMedia(ctx.db, result, row.id);

      // Fallback: if TVDB is effective but no TVDB seasons exist after persist
      // (e.g. show created before TVDB was enabled, or TVDB fetch failed),
      // trigger reconcileShowStructure to apply TVDB structure.
      if (effectiveProvider === "tvdb" && row.type === "show") {
        const hasTvdbSeasons = await ctx.db.query.season.findFirst({
          where: and(eq(season.mediaId, row.id), inArray(season.seasonType, ["official", "default"])),
          columns: { id: true },
        });
        if (!hasTvdbSeasons) {
          await reconcileShowStructure(ctx.db, row.id, { tmdb, tvdb, dispatcher: jobDispatcher }, { force: true });
        }
      }

      return findMediaById(ctx.db, input.id);
    }),
});
