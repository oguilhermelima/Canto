import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";

import { getProvider } from "@canto/providers";
import type { SearchResult, MediaType, ProviderName } from "@canto/providers";
import { season, user } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import {
  getByExternalInput,
  getByIdInput,
  getByMediaIdInput,
  browseMediaInput,
  resolveMediaInput,
  getPersonInput,
  recommendationsInput,
  getLogoInput,
  setOverrideProviderInput,
  applyProviderOverrideInput,
} from "@canto/validators";

import { createTRPCRouter, adminProcedure, protectedProcedure, publicProcedure } from "../trpc";
import { getTmdbProvider } from "@canto/core/lib/tmdb-client";
import { getTvdbProvider } from "@canto/core/lib/tvdb-client";
import { dispatchRefreshExtras, dispatchRebuildUserRecs } from "@canto/core/infrastructure/queue/bullmq-dispatcher";
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
import {
  resolveMedia,
  persistMediaUseCase,
  persistFullMedia,
} from "@canto/core/domain/use-cases/persist-media";
import { getActiveUserLanguages } from "@canto/core/domain/services/user-service";
import { getRecommendations } from "@canto/core/domain/use-cases/get-recommendations";
import { fetchLogos, enrichBrowseWithLogos } from "@canto/core/domain/use-cases/fetch-logos";
import { db as appDb } from "@canto/db/client";
import { setLibraryStatus } from "@canto/core/domain/use-cases/manage-library-status";
import type { RecsFilters } from "@canto/core/infrastructure/repositories/user-recommendation-repository";
import { fetchMediaMetadata } from "@canto/core/domain/use-cases/fetch-media-metadata";
import { getEffectiveProvider } from "@canto/core/domain/rules/effective-provider";
import { reconcileShowStructure } from "@canto/core/domain/use-cases/reconcile-show-structure";
import { jobDispatcher } from "@canto/core/infrastructure/adapters/job-dispatcher.adapter";
import { findServerLibrary, removeListItem } from "@canto/core/infrastructure/repositories/list-repository";
import { revertRequestStatus } from "@canto/core/infrastructure/repositories/request-repository";
import { findMediaVersionsByMediaId } from "@canto/core/infrastructure/repositories/media-version-repository";
import { executeReorganizeMediaFiles } from "@canto/core/domain/use-cases/file-organization/reorganize-media-files";
import { createNodeFileSystemAdapter } from "@canto/core/infrastructure/adapters/filesystem";
import { updateMediaServerMetadata } from "@canto/core/domain/use-cases/update-media-server-metadata";

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
      const browseSettingsLang = (await getSetting("general.language")) ?? "en-US";

      if (input.mode === "search") {
        if (!input.query) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Query is required for search mode" });
        }

        const searchLang = browseSettingsLang;
        const searchResults = await cached(
          `browse:search:${input.provider}:${input.type}:${input.query}:${page}:${searchLang}`,
          1800,
          async () => {
            const provider = await getProviderWithKey(input.provider);
            return provider.search(input.query!, input.type, { page });
          },
        );

        // Post-filter search results by genre/language/score (TMDB search API doesn't support these)
        const genreSet = input.genres
          ? new Set(input.genres.split(/[|,]/).map(Number).filter(Boolean))
          : null;
        const genreMode = input.genres?.includes(",") ? "and" : "or";

        const hasPostFilters = genreSet || input.language || input.scoreMin != null || input.scoreMax != null || input.dateFrom || input.dateTo;
        if (hasPostFilters) {
          const filtered = searchResults.results.filter((r) => {
            if (genreSet && r.genreIds) {
              if (genreMode === "and") {
                if (!([...genreSet].every((g) => r.genreIds!.includes(g)))) return false;
              } else {
                if (!r.genreIds.some((g) => genreSet.has(g))) return false;
              }
            } else if (genreSet && !r.genreIds) {
              return false;
            }
            if (input.language && r.originalLanguage !== input.language) return false;
            if (input.scoreMin != null && (r.voteAverage ?? 0) < input.scoreMin) return false;
            if (input.scoreMax != null && (r.voteAverage ?? 0) > input.scoreMax) return false;
            if (input.dateFrom && r.releaseDate && r.releaseDate < input.dateFrom) return false;
            if (input.dateTo && r.releaseDate && r.releaseDate > input.dateTo) return false;
            return true;
          });
          return enrichBrowseWithLogos(appDb, {
            ...searchResults,
            results: filtered,
            totalResults: filtered.length,
          }, browseSettingsLang);
        }

        return enrichBrowseWithLogos(appDb, searchResults, browseSettingsLang);
      }

      const cacheKey = `browse:${input.type}:${input.mode}:${input.query ?? ""}:${input.genres ?? ""}:${input.language ?? ""}:${input.sortBy ?? ""}:${input.dateFrom ?? ""}:${input.dateTo ?? ""}:${input.keywords ?? ""}:${input.scoreMin ?? ""}:${input.scoreMax ?? ""}:${input.runtimeMax ?? ""}:${input.certification ?? ""}:${input.status ?? ""}:${input.watchProviders ?? ""}:${input.watchRegion ?? ""}:${input.runtimeMin ?? ""}:${page}:${browseSettingsLang}`;

      const browseResults = await cached(cacheKey, 1800, async () => {
        const provider = await getTmdbProvider();
        const today = new Date().toISOString().slice(0, 10);

        const filterReleased = <T extends { results: SearchResult[] }>(data: T): T => ({
          ...data,
          results: data.results.filter((r) => !r.releaseDate || r.releaseDate <= today),
        });

        const discoverOpts = {
          page,
          query: input.query,
          genreIds: input.genres,
          originalLanguage: input.language,
          keywordIds: input.keywords,
          minScore: input.scoreMin,
          maxScore: input.scoreMax,
          minRuntime: input.runtimeMin,
          maxRuntime: input.runtimeMax,
          sort_by: input.sortBy ?? "popularity.desc",
          firstAirDateFrom: input.type === "show" ? input.dateFrom : undefined,
          releaseDateFrom: input.type === "movie" ? input.dateFrom : undefined,
          firstAirDateTo: input.type === "show" ? (input.dateTo ?? today) : undefined,
          releaseDateTo: input.type === "movie" ? (input.dateTo ?? today) : undefined,
          certification: input.certification,
          certification_country: input.certification ? "US" : undefined,
          with_status: input.status,
          watchProviderIds: input.watchProviders,
          watchRegion: input.watchRegion,
        };

        if (input.mode === "trending") {
          const hasFilters = input.genres || input.language || input.keywords || input.scoreMin != null || input.scoreMax != null || input.runtimeMax != null || input.certification || input.status || input.watchProviders || input.runtimeMin != null;
          if (hasFilters) {
            return filterReleased(await provider.discover(input.type, discoverOpts));
          }
          return filterReleased(await provider.getTrending(input.type, { page }));
        }

        return filterReleased(await provider.discover(input.type, discoverOpts));
      });
      return enrichBrowseWithLogos(appDb, browseResults, browseSettingsLang);
    }),

  getById: protectedProcedure.input(getByIdInput).query(async ({ ctx, input }) => {
    const row = await findMediaByIdWithSeasons(ctx.db, input.id);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });

    const userLang = await getUserLanguage(ctx.db, ctx.session.user.id);
    const translated = await applyMediaTranslation(ctx.db, row, userLang);
    if (translated.seasons) {
      await applySeasonsTranslation(ctx.db, translated.seasons, userLang);
    }
    return translated;
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
      const serverLib = await findServerLibrary(ctx.db);
      if (serverLib) await removeListItem(ctx.db, serverLib.id, input.id);
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
        await executeReorganizeMediaFiles(ctx.db, input.id, {
          fs: createNodeFileSystemAdapter(),
        });
      }

      if (input.updateMediaServer) {
        await updateMediaServerMetadata(ctx.db, input.id);
      }

      return findMediaById(ctx.db, input.id);
    }),

  listFiles: protectedProcedure
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

  getLogo: protectedProcedure
    .input(getLogoInput)
    .query(async ({ ctx, input }) => {
      const tmdb = await getTmdbProvider();
      const result = await fetchLogos(ctx.db, tmdb, [input]);
      const key = `${input.provider}-${input.type}-${input.externalId}`;
      return { logoPath: result[key] ?? null };
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
        scoreMax: input?.scoreMax,
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
