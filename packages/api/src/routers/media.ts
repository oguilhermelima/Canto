import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { getProvider } from "@canto/providers";
import type { SearchResult, MediaType, ProviderName } from "@canto/providers";
import { user } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import {
  getByExternalInput,
  getByIdInput,
  getByMediaIdInput,
  browseMediaInput,
  resolveMediaInput,
  getPersonInput,
  recommendationsInput,
} from "@canto/validators";

import { createTRPCRouter, adminProcedure, protectedProcedure, publicProcedure } from "../trpc";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import { getTvdbProvider } from "@canto/core/lib/tvdb-client";
import { SETTINGS } from "@canto/core/lib/settings-keys";
import { dispatchRefreshExtras, dispatchEnrichMedia, dispatchRebuildUserRecs } from "@canto/core/infrastructure/queue/bullmq-dispatcher";
import { cached } from "@canto/core/infrastructure/cache/redis";
import { logAndSwallow } from "@canto/core/lib/log-error";
import {
  findMediaById,
  findMediaByIdWithSeasons,
  updateMedia,
  deleteMedia,
} from "@canto/core/infrastructure/repositories/media-repository";
import { applyMediaTranslation, applySeasonsTranslation } from "@canto/core/domain/services/translation-service";
import { getUserLanguage } from "@canto/core/domain/services/user-service";
import { findMediaFilesByMediaId } from "@canto/core/infrastructure/repositories/media-file-repository";

// ── Extracted use-cases & services ──
import { loadExtrasFromDB } from "@canto/core/domain/services/extras-service";
import { getByExternal } from "@canto/core/domain/use-cases/get-by-external";
import { resolveMedia } from "@canto/core/domain/use-cases/resolve-media";
import { persistMediaUseCase } from "@canto/core/domain/use-cases/persist-media";
import { getRecommendations } from "@canto/core/domain/use-cases/get-recommendations";
import { setLibraryStatus } from "@canto/core/domain/use-cases/manage-library-status";
import { mapPoolItem } from "@canto/core/domain/mappers/media-mapper";
import type { RecsFilters } from "@canto/core/infrastructure/repositories/user-recommendation-repository";
import { getSupportedLanguageCodes } from "@canto/db/persist-media";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function getProviderWithKey(name: "tmdb" | "tvdb"): ReturnType<typeof getProvider> {
  if (name === "tmdb") return getTmdbProvider();
  return getTvdbProvider();
}

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const mediaRouter = createTRPCRouter({
  browse: publicProcedure
    .input(browseMediaInput)
    .query(async ({ input }) => {
      const page = input.cursor ?? input.page;

      if (input.mode === "search") {
        if (!input.query) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Query is required for search mode" });
        }

        const searchLang = (await getSetting(SETTINGS.LANGUAGE)) ?? "en-US";
        return cached(
          `browse:search:${input.provider}:${input.type}:${input.query}:${page}:${searchLang}`,
          300,
          async () => {
            const provider = await getProviderWithKey(input.provider);
            return provider.search(input.query!, input.type, { page });
          },
        );
      }

      const settingsLang = (await getSetting(SETTINGS.LANGUAGE)) ?? "en-US";
      const cacheKey = `browse:${input.type}:${input.mode}:${input.genres ?? ""}:${input.language ?? ""}:${input.sortBy ?? ""}:${input.dateFrom ?? ""}:${input.dateTo ?? ""}:${input.keywords ?? ""}:${input.scoreMin ?? ""}:${input.runtimeMax ?? ""}:${input.certification ?? ""}:${input.status ?? ""}:${input.watchProviders ?? ""}:${input.watchRegion ?? ""}:${input.runtimeMin ?? ""}:${page}:${settingsLang}`;

      return cached(cacheKey, 300, async () => {
        const provider = await getTmdbProvider();
        const today = new Date().toISOString().slice(0, 10);

        const filterReleased = <T extends { results: SearchResult[] }>(data: T): T => ({
          ...data,
          results: data.results.filter((r) => !r.releaseDate || r.releaseDate <= today),
        });

        if (input.mode === "trending") {
          const hasFilters = input.genres || input.language || input.keywords || input.scoreMin != null || input.runtimeMax != null || input.certification || input.status || input.watchProviders || input.runtimeMin != null;
          if (hasFilters) {
            return filterReleased(await provider.discover(input.type, {
              page,
              with_genres: input.genres,
              with_original_language: input.language,
              with_keywords: input.keywords,
              vote_average_gte: input.scoreMin,
              with_runtime_lte: input.runtimeMax,
              sort_by: input.sortBy ?? "popularity.desc",
              first_air_date_gte: input.type === "show" ? input.dateFrom : undefined,
              release_date_gte: input.type === "movie" ? input.dateFrom : undefined,
              first_air_date_lte: input.type === "show" ? (input.dateTo ?? today) : undefined,
              release_date_lte: input.type === "movie" ? (input.dateTo ?? today) : undefined,
              certification: input.certification,
              certification_country: input.certification ? "US" : undefined,
              with_status: input.status,
              with_watch_providers: input.watchProviders,
              watch_region: input.watchRegion,
              with_runtime_gte: input.runtimeMin,
            }));
          }
          return filterReleased(await provider.getTrending(input.type, { page }));
        }

        return filterReleased(await provider.discover(input.type, {
          page,
          with_genres: input.genres,
          with_original_language: input.language,
          with_keywords: input.keywords,
          vote_average_gte: input.scoreMin,
          with_runtime_lte: input.runtimeMax,
          sort_by: input.sortBy ?? "popularity.desc",
          first_air_date_gte: input.type === "show" ? input.dateFrom : undefined,
          release_date_gte: input.type === "movie" ? input.dateFrom : undefined,
          first_air_date_lte: input.type === "show" ? (input.dateTo ?? today) : undefined,
          release_date_lte: input.type === "movie" ? (input.dateTo ?? today) : undefined,
          certification: input.certification,
          certification_country: input.certification ? "US" : undefined,
          with_status: input.status,
          with_watch_providers: input.watchProviders,
          watch_region: input.watchRegion,
          with_runtime_gte: input.runtimeMin,
        }));
      });
    }),

  getById: protectedProcedure.input(getByIdInput).query(async ({ ctx, input }) => {
    const row = await findMediaByIdWithSeasons(ctx.db, input.id);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });

    const userLang = await getUserLanguage(ctx.db, ctx.session.user.id);
    const translated = await applyMediaTranslation(ctx.db, row, userLang);
    if (translated.seasons) {
      await applySeasonsTranslation(ctx.db, translated.seasons as any, userLang);
    }
    return translated;
  }),

  getByExternal: protectedProcedure
    .input(getByExternalInput)
    .query(async ({ ctx, input }) => {
      const result = await getByExternal(
        ctx.db, input, ctx.session.user.id,
        getProviderWithKey,
        () => getSupportedLanguageCodes(ctx.db).then((s) => [...s]),
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

      const settingsLang = (await getSetting(SETTINGS.LANGUAGE)) ?? "en-US";
      const extras = await loadExtrasFromDB(ctx.db, input.id, settingsLang);

      // If extras tables have data, return them
      if (extras.credits.cast.length > 0 || extras.videos.length > 0) {
        return extras;
      }

      // New tables empty — dispatch background refresh and fetch from TMDB directly
      void dispatchRefreshExtras(input.id).catch(logAndSwallow("media:getExtras dispatchRefreshExtras"));

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

      const { fetchMediaMetadata } = await import("@canto/core/domain/use-cases/fetch-media-metadata");
      const { persistFullMedia } = await import("@canto/db/persist-media");
      const [tmdb, tvdb] = await Promise.all([getTmdbProvider(), getTvdbProvider()]);
      const tvdbEnabled = (await getSetting<boolean>(SETTINGS.TVDB_DEFAULT_SHOWS)) === true;
      const supportedLangs = [...await getSupportedLanguageCodes(ctx.db)];

      const result = await fetchMediaMetadata(
        row.externalId, row.provider as ProviderName, row.type as MediaType,
        { tmdb, tvdb },
        { reprocess: true, useTVDBSeasons: tvdbEnabled, supportedLanguages: supportedLangs },
      );

      await persistFullMedia(ctx.db, result, row.id);
      return findMediaById(ctx.db, input.id);
    }),

  addToLibrary: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await setLibraryStatus(ctx.db, input.id, { inLibrary: true });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return updated;
    }),

  markDownloaded: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await setLibraryStatus(ctx.db, input.id, { inLibrary: true, downloaded: true });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return updated;
    }),

  removeFromLibrary: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await updateMedia(ctx.db, input.id, { inLibrary: false, downloaded: false });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      const { findServerLibrary, removeListItem } = await import(
        "@canto/core/infrastructure/repositories/list-repository"
      );
      const serverLib = await findServerLibrary(ctx.db);
      if (serverLib) await removeListItem(ctx.db, serverLib.id, input.id);
      const { revertRequestStatus } = await import(
        "@canto/core/infrastructure/repositories/request-repository"
      );
      await revertRequestStatus(ctx.db, input.id, "downloaded", "approved");
      return updated;
    }),

  delete: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteMedia(ctx.db, input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return { success: true };
    }),

  syncTvdbSeasons: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const [{ reconcileShowStructure }, tmdb, tvdb, { jobDispatcher }] = await Promise.all([
        import("@canto/core/domain/use-cases/reconcile-show-structure"),
        getTmdbProvider(),
        getTvdbProvider(),
        import("@canto/core/infrastructure/adapters/job-dispatcher.adapter"),
      ]);
      await reconcileShowStructure(ctx.db, input.id, { tmdb, tvdb, dispatcher: jobDispatcher }, { force: true });
    }),

  listFiles: publicProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) => findMediaFilesByMediaId(ctx.db, input.mediaId)),

  getPerson: publicProcedure
    .input(getPersonInput)
    .query(({ input }) =>
      cached(`person:${input.personId}`, 86400, async () => {
        const provider = await getTmdbProvider();
        return provider.getPerson(input.personId);
      }),
    ),

  rebuildMyRecommendations: protectedProcedure
    .mutation(async ({ ctx }) => {
      await dispatchRebuildUserRecs(ctx.session.user.id);
      return { success: true };
    }),

  recommendations: protectedProcedure
    .input(recommendationsInput.optional())
    .query(async ({ ctx, input }) => {
      const page = input?.cursor ?? 0;
      const pageSize = input?.pageSize ?? 10;
      const userId = ctx.session.user.id;

      const recsFilters: RecsFilters = {
        genreIds: input?.genreIds,
        genreMode: input?.genreMode ?? "or",
        language: input?.language,
        scoreMin: input?.scoreMin,
        yearMin: input?.yearMin,
        yearMax: input?.yearMax,
        runtimeMin: input?.runtimeMin,
        runtimeMax: input?.runtimeMax,
        certification: input?.certification,
        status: input?.status,
        sortBy: input?.sortBy,
        watchProviders: input?.watchProviders,
        watchRegion: input?.watchRegion,
      };

      const userRow = await ctx.db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: { recsVersion: true, language: true },
      });

      const tmdb = await getTmdbProvider();
      return getRecommendations(ctx.db, {
        userId, page, pageSize, filters: recsFilters,
        userLang: userRow?.language ?? "en-US",
        recsVersion: userRow?.recsVersion ?? 0,
      }, tmdb);
    }),
});
