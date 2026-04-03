import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { getProvider } from "@canto/providers";
import { user } from "@canto/db/schema";
import { persistMedia, updateMediaFromNormalized, getSupportedLanguageCodes } from "@canto/db/persist-media";
import { getSetting } from "@canto/db/settings";
import {
  getByExternalInput,
  getByIdInput,
} from "@canto/validators";

import { createTRPCRouter, adminProcedure, protectedProcedure, publicProcedure } from "../trpc";
import { getTmdbProvider } from "../lib/tmdb-client";
import { getTvdbProvider } from "../lib/tvdb-client";
import { SETTINGS } from "../lib/settings-keys";
import { dispatchRefreshExtras, dispatchReconcileShow, dispatchEnrichMedia } from "../infrastructure/queue/bullmq-dispatcher";
import { cached } from "../infrastructure/cache/redis";
import { logAndSwallow } from "../lib/log-error";
import {
  findMediaById,
  findMediaByIdWithSeasons,
  findMediaByExternalId,
  findMediaByAnyReference,
  updateMedia,
  deleteMedia,
  findLibraryMediaBrief,
} from "../infrastructure/repositories/media-repository";
import { applyMediaTranslation, applySeasonsTranslation, translateMediaItems } from "../domain/services/translation-service";
import { getUserLanguage } from "../domain/services/user-service";
import { buildExclusionSet } from "../domain/services/recommendation-service";
import { mapPoolItem } from "../domain/mappers/media-mapper";
import { findMediaFilesByMediaId } from "../infrastructure/repositories/media-file-repository";
import {
  findCreditsByMediaId,
  findVideosByMediaId,
  findWatchProvidersByMediaId,
  findRecommendationsBySource,
  findGlobalRecommendations,
} from "../infrastructure/repositories/extras-repository";
import {
  findUserRecommendations,
  countUserRecommendations,
  type RecsFilters,
} from "../infrastructure/repositories/user-recommendation-repository";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

async function getProviderWithKey(name: "tmdb" | "anilist" | "tvdb"): ReturnType<typeof getProvider> {
  if (name === "tmdb") {
    return getTmdbProvider();
  }
  if (name === "tvdb") {
    return getTvdbProvider();
  }
  return getProvider(name);
}

export const mediaRouter = createTRPCRouter({
  /**
   * Unified browse endpoint. Supports:
   * - mode "search": free-text search via any provider
   * - mode "trending": TMDB /trending endpoint (default)
   * - mode "discover": TMDB /discover endpoint (genre, language, sort filters)
   */
  browse: publicProcedure
    .input(z.object({
      mode: z.enum(["search", "trending", "discover"]).default("trending"),
      type: z.enum(["movie", "show"]),
      query: z.string().optional(), // required when mode = "search"
      provider: z.enum(["tmdb", "anilist", "tvdb"]).default("tmdb"),
      genres: z.string().optional(),
      language: z.string().optional(),
      sortBy: z.string().optional(),
      dateFrom: z.string().optional(),
      keywords: z.string().optional(),      // TMDB keyword IDs
      scoreMin: z.number().optional(),      // min vote average
      runtimeMax: z.number().optional(),    // max runtime minutes
      dateTo: z.string().optional(),        // year range max
      certification: z.string().optional(),
      status: z.string().optional(),
      watchProviders: z.string().optional(),
      watchRegion: z.string().optional(),
      runtimeMin: z.number().optional(),
      page: z.number().int().min(1).default(1),
      cursor: z.number().int().positive().nullish(),
    }))
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

        if (input.mode === "trending") {
          const hasFilters = input.genres || input.language || input.keywords || input.scoreMin != null || input.runtimeMax != null || input.certification || input.status || input.watchProviders || input.runtimeMin != null;
          if (hasFilters) {
            // Use discover mode for proper server-side filtering
            return provider.discover(input.type, {
              page,
              with_genres: input.genres,
              with_original_language: input.language,
              with_keywords: input.keywords,
              vote_average_gte: input.scoreMin,
              with_runtime_lte: input.runtimeMax,
              sort_by: input.sortBy ?? "popularity.desc",
              first_air_date_gte: input.type === "show" ? input.dateFrom : undefined,
              release_date_gte: input.type === "movie" ? input.dateFrom : undefined,
              first_air_date_lte: input.type === "show" ? input.dateTo : undefined,
              release_date_lte: input.type === "movie" ? input.dateTo : undefined,
              certification: input.certification,
              certification_country: input.certification ? "US" : undefined,
              with_status: input.status,
              with_watch_providers: input.watchProviders,
              watch_region: input.watchRegion,
              with_runtime_gte: input.runtimeMin,
            });
          }
          return provider.getTrending(input.type, { page });
        }

        // mode === "discover"
        return provider.discover(input.type, {
          page,
          with_genres: input.genres,
          with_original_language: input.language,
          with_keywords: input.keywords,
          vote_average_gte: input.scoreMin,
          with_runtime_lte: input.runtimeMax,
          sort_by: input.sortBy ?? "popularity.desc",
          first_air_date_gte: input.type === "show" ? input.dateFrom : undefined,
          release_date_gte: input.type === "movie" ? input.dateFrom : undefined,
          first_air_date_lte: input.type === "show" ? input.dateTo : undefined,
          release_date_lte: input.type === "movie" ? input.dateTo : undefined,
          certification: input.certification,
          certification_country: input.certification ? "US" : undefined,
          with_status: input.status,
          with_watch_providers: input.watchProviders,
          watch_region: input.watchRegion,
          with_runtime_gte: input.runtimeMin,
        });
      });
    }),

  /**
   * Get media from DB by its internal UUID.
   * Returns the media row with seasons and episodes.
   */
  getById: protectedProcedure.input(getByIdInput).query(async ({ ctx, input }) => {
    const row = await findMediaByIdWithSeasons(ctx.db, input.id);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });

    // Apply user's language translation
    const userLang = await getUserLanguage(ctx.db, ctx.session.user.id);
    const translated = await applyMediaTranslation(ctx.db, row, userLang);
    if (translated.seasons) {
      await applySeasonsTranslation(ctx.db, translated.seasons as any, userLang);
    }
    return translated;
  }),

  /**
   * "Persist on visit" — check DB first, otherwise fetch from provider and
   * insert media + seasons + episodes, then return the DB record.
   */
  getByExternal: protectedProcedure
    .input(getByExternalInput)
    .query(async ({ ctx, input }) => {
      // Check TVDB toggle
      const tvdbEnabled = (await getSetting<boolean>(SETTINGS.TVDB_DEFAULT_SHOWS)) === true;

      // When TVDB is enabled, check cross-references to prevent duplicates
      const existing = tvdbEnabled
        ? await findMediaByAnyReference(ctx.db, input.externalId, input.provider)
        : await findMediaByExternalId(ctx.db, input.externalId, input.provider);

      const getUserLang = () => getUserLanguage(ctx.db, ctx.session.user.id);

      if (existing) {
        // Dispatch enrichment if not fully processed
        if (existing.processingStatus !== "ready") {
          void dispatchEnrichMedia(existing.id, true).catch(logAndSwallow("media:getByExternal dispatchEnrichMedia"));
        }
        // Still check stale extras for downloaded media
        if (existing.downloaded && existing.processingStatus === "ready") {
          const STALE_MS = 30 * 24 * 60 * 60 * 1000;
          const isStale = !existing.extrasUpdatedAt || Date.now() - existing.extrasUpdatedAt.getTime() > STALE_MS;
          if (isStale) void dispatchRefreshExtras(existing.id).catch(logAndSwallow("media:getByExternal dispatchRefreshExtras"));
        }
        const lang = await getUserLang();
        const translated = await applyMediaTranslation(ctx.db, existing, lang);
        if (translated.seasons) {
          await applySeasonsTranslation(ctx.db, translated.seasons as any, lang);
        }
        return translated;
      }

      const provider = await getProviderWithKey(input.provider);
      const supportedLangs = [...await getSupportedLanguageCodes(ctx.db)];
      const normalized = await provider.getMetadata(input.externalId, input.type, { supportedLanguages: supportedLangs });

      // When TVDB enabled, double-check cross-refs from fetched metadata
      if (tvdbEnabled) {
        const crossRef = await findMediaByAnyReference(
          ctx.db, normalized.externalId, normalized.provider,
          normalized.imdbId, normalized.tvdbId,
        );
        if (crossRef) {
          const lang = await getUserLang();
          const translated = await applyMediaTranslation(ctx.db, crossRef, lang);
          if (translated.seasons) {
            await applySeasonsTranslation(ctx.db, translated.seasons as any, lang);
          }
          return translated;
        }
      }

      const inserted = await persistMedia(ctx.db, normalized, { crossRefLookup: tvdbEnabled });

      if (tvdbEnabled && normalized.type === "show" && normalized.provider === "tmdb") {
        void dispatchReconcileShow(inserted.id).catch(logAndSwallow("media:getByExternal dispatchReconcileShow"));
      }

      const result = await findMediaByIdWithSeasons(ctx.db, inserted.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      const lang = await getUserLang();
      const translated = await applyMediaTranslation(ctx.db, result, lang);
      if (translated.seasons) {
        await applySeasonsTranslation(ctx.db, translated.seasons as any, lang);
      }
      return translated;
    }),

  /**
   * Get extras (credits, similar, recommendations, videos, watch providers).
   * Reads from dedicated tables (populated by refresh-extras job).
   * Falls back to TMDB direct fetch if tables are empty (dispatches background refresh).
   */
  getExtras: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await findMediaById(ctx.db, input.id);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      }

      const [credits, videos, watchProviders, similar, recommendations] = await Promise.all([
        findCreditsByMediaId(ctx.db, input.id),
        findVideosByMediaId(ctx.db, input.id),
        findWatchProvidersByMediaId(ctx.db, input.id),
        findRecommendationsBySource(ctx.db, input.id, "similar"),
        findRecommendationsBySource(ctx.db, input.id, "recommendation"),
      ]);

      // If new tables have data, build response from them
      if (credits.length > 0 || videos.length > 0) {
        const cast = credits
          .filter((c) => c.type === "cast")
          .map((c) => ({
            id: c.personId,
            name: c.name,
            character: c.character ?? "",
            profilePath: c.profilePath ?? undefined,
            order: c.order,
          }));

        const crew = credits
          .filter((c) => c.type === "crew")
          .map((c) => ({
            id: c.personId,
            name: c.name,
            job: c.job ?? "",
            department: c.department ?? "",
            profilePath: c.profilePath ?? undefined,
          }));

        // Group watch providers by region
        const wpByRegion: Record<string, {
          link?: string;
          flatrate?: Array<{ providerId: number; providerName: string; logoPath: string }>;
          rent?: Array<{ providerId: number; providerName: string; logoPath: string }>;
          buy?: Array<{ providerId: number; providerName: string; logoPath: string }>;
        }> = {};

        for (const wp of watchProviders) {
          if (!wpByRegion[wp.region]) wpByRegion[wp.region] = {};
          const region = wpByRegion[wp.region]!;
          const entry = {
            providerId: wp.providerId,
            providerName: wp.providerName,
            logoPath: wp.logoPath ?? "",
          };
          if (wp.type === "stream") {
            (region.flatrate ??= []).push(entry);
          } else if (wp.type === "rent") {
            (region.rent ??= []).push(entry);
          } else if (wp.type === "buy") {
            (region.buy ??= []).push(entry);
          }
        }

        // Apply language translations to similar/recommendations
        const settingsLang = (await getSetting(SETTINGS.LANGUAGE)) ?? "en-US";
        const mappedSimilar = similar.map(mapPoolItem);
        const mappedRecs = recommendations.map(mapPoolItem);
        const [translatedSimilar, translatedRecs] = await Promise.all([
          translateMediaItems(ctx.db, mappedSimilar, settingsLang),
          translateMediaItems(ctx.db, mappedRecs, settingsLang),
        ]);

        return {
          credits: { cast, crew },
          similar: translatedSimilar,
          recommendations: translatedRecs,
          videos: (() => {
            // Prefer user's language, fallback to English/null
            const langPrefix = settingsLang.split("-")[0];
            const mapped = videos.map((v) => ({
              id: v.id,
              key: v.externalKey,
              name: v.name,
              site: v.site,
              type: v.type,
              official: v.official,
              language: (v as { language?: string }).language ?? null,
            }));
            return mapped.sort((a, b) => {
              if (a.language === langPrefix && b.language !== langPrefix) return -1;
              if (b.language === langPrefix && a.language !== langPrefix) return 1;
              return 0;
            });
          })(),
          watchProviders: wpByRegion,
        };
      }

      // New tables empty — dispatch background refresh and return empty for now
      void dispatchRefreshExtras(input.id).catch(logAndSwallow("media:getExtras dispatchRefreshExtras"));

      // Fetch from TMDB directly as one-time response (next call will have new tables populated)
      const tmdb = await getTmdbProvider();
      // For non-TMDB media, try to find TMDB equivalent via IMDB ID
      let tmdbExternalId = row.externalId;
      if (row.provider !== "tmdb" && row.imdbId) {
        try {
          const found = await tmdb.findByImdbId(row.imdbId);
          if (found.length > 0) tmdbExternalId = found[0]!.externalId;
        } catch { /* use original ID as fallback */ }
      }
      return tmdb.getExtras(tmdbExternalId, row.type as "movie" | "show");
    }),

  /**
   * Re-fetch metadata from the original provider and update the DB record.
   */
  updateMetadata: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await findMediaById(ctx.db, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      const provider = await getProviderWithKey(row.provider as "tmdb" | "anilist" | "tvdb");
      const langs = [...await getSupportedLanguageCodes(ctx.db)];
      const normalized = await provider.getMetadata(row.externalId, row.type as "movie" | "show", { supportedLanguages: langs });
      return updateMediaFromNormalized(ctx.db, input.id, normalized);
    }),

  /**
   * Admin: mark media as no longer downloaded (removes from server library).
   */
  unmarkDownloaded: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await updateMedia(ctx.db, input.id, { downloaded: false });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      // Remove from server library list
      const { findServerLibrary, removeListItem } = await import(
        "../infrastructure/repositories/list-repository"
      );
      const serverLib = await findServerLibrary(ctx.db);
      if (serverLib) await removeListItem(ctx.db, serverLib.id, input.id);
      // Revert downloaded requests back to approved
      const { revertRequestStatus } = await import(
        "../infrastructure/repositories/request-repository"
      );
      await revertRequestStatus(ctx.db, input.id, "downloaded", "approved");
      return updated;
    }),

  /**
   * Hard delete a media record (cascades to seasons, episodes, files, cache).
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteMedia(ctx.db, input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return { success: true };
    }),

  /**
   * Sync season/episode structure from TVDB for a show.
   * Keeps the media as TMDB provider — only replaces seasons and episodes.
   */
  syncTvdbSeasons: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [{ reconcileShowStructure }, tmdb, tvdb, { jobDispatcher }] = await Promise.all([
        import("../domain/use-cases/reconcile-show-structure"),
        getTmdbProvider(),
        getTvdbProvider(),
        import("../infrastructure/adapters/job-dispatcher.adapter"),
      ]);
      await reconcileShowStructure(ctx.db, input.id, {
        tmdb,
        tvdb,
        dispatcher: jobDispatcher,
      });
    }),

  /**
   * List media files (on disk) for a given media, with episode and torrent info.
   */
  listFiles: publicProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(({ ctx, input }) => findMediaFilesByMediaId(ctx.db, input.mediaId)),

  /**
   * Get person detail from TMDB (biography, credits, images).
   */
  getPerson: publicProcedure
    .input(z.object({ personId: z.number() }))
    .query(({ input }) =>
      cached(`person:${input.personId}`, 86400, async () => {
        const provider = await getTmdbProvider();
        return provider.getPerson(input.personId);
      }),
    ),

  /**
   * Get per-user recommendations.
   * Primary: reads from user_recommendation (per-user, pre-computed by scheduler).
   * Fallback: global recommendations when user has no personal recs yet.
   * Last resort: live TMDB fetch when pool is empty.
   */
  recommendations: protectedProcedure
    .input(z.object({
      cursor: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(20).default(10),
      genreIds: z.array(z.number()).optional(),
      genreMode: z.enum(["and", "or"]).default("or").optional(),
      language: z.string().optional(),
      scoreMin: z.number().optional(),
      yearMin: z.string().optional(),
      yearMax: z.string().optional(),
      runtimeMin: z.number().optional(),
      runtimeMax: z.number().optional(),
      certification: z.string().optional(),
      status: z.string().optional(),
      sortBy: z.string().optional(),
      watchProviders: z.string().optional(),
      watchRegion: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const page = input?.cursor ?? 0;
      const pageSize = input?.pageSize ?? 10;
      const offset = page * pageSize;
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

      // Get user's current recs version + language
      const userRow = await ctx.db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: { recsVersion: true, language: true },
      });
      const version = userRow?.recsVersion ?? 0;
      const userLang = userRow?.language ?? "en-US";

      const { excludeItems } = await buildExclusionSet(ctx.db, userId);

      // ── Path 1: Per-user recommendations ──
      const userRecCount = await countUserRecommendations(ctx.db, userId);
      if (userRecCount > 0) {
        const rows = await findUserRecommendations(
          ctx.db,
          userId,
          excludeItems,
          pageSize + 1, // fetch 1 extra to detect hasMore
          offset,
          recsFilters,
        );

        const hasMore = rows.length > pageSize;
        const items = rows.slice(0, pageSize).map(mapPoolItem);
        const translatedItems = await translateMediaItems(ctx.db, items, userLang);
        return { items: translatedItems, nextCursor: hasMore ? page + 1 : null, version };
      }

      // ── Path 2: Fallback to global pool ──
      const poolItems = await findGlobalRecommendations(ctx.db, excludeItems, (pageSize + 1) * 3, offset, recsFilters);

      if (poolItems.length > 0) {
        const seen = new Set<string>();
        const unique = poolItems.filter((item) => {
          if (!item.posterPath) return false;
          const key = `${item.provider}-${item.externalId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const hasMore = unique.length > pageSize;
        const items = unique.slice(0, pageSize).map(mapPoolItem);
        const translatedPoolItems = await translateMediaItems(ctx.db, items, userLang);
        return { items: translatedPoolItems, nextCursor: hasMore ? page + 1 : null, version };
      }

      // ── Path 3: Live TMDB fallback (pool completely empty) ──
      if (excludeItems.length === 0) return { items: [], nextCursor: null, version };

      const allLibrary = await findLibraryMediaBrief(ctx.db);
      const seedStart = (page * 3) % allLibrary.length;
      const seeds: typeof allLibrary = [];
      for (let i = 0; i < 3 && i < allLibrary.length; i++) {
        seeds.push(allLibrary[(seedStart + i) % allLibrary.length]!);
      }

      const tmdb = await getTmdbProvider();
      const libraryKeys = new Set(excludeItems.map((m) => `${m.provider}-${m.externalId}`));
      const seenKeys = new Set<string>();
      const results: Array<{
        externalId: number; provider: string; type: "movie" | "show";
        title: string; posterPath: string | null; backdropPath: string | null;
        year: number | undefined; voteAverage: number | undefined;
        overview: string | undefined; logoPath: string | null; trailerKey: string | null;
      }> = [];

      await Promise.all(
        seeds.map(async (item) => {
          try {
            const extras = await tmdb.getExtras(Number(item.externalId), item.type as "movie" | "show");
            for (const rec of extras.recommendations ?? []) {
              const key = `${rec.provider ?? "tmdb"}-${rec.externalId}`;
              if (libraryKeys.has(key) || seenKeys.has(key)) continue;
              seenKeys.add(key);
              results.push({
                externalId: rec.externalId, provider: rec.provider ?? "tmdb",
                type: (rec.type ?? item.type) as "movie" | "show",
                title: rec.title, posterPath: rec.posterPath ?? null,
                backdropPath: rec.backdropPath ?? null, year: rec.year,
                voteAverage: rec.voteAverage, overview: rec.overview,
                logoPath: null, trailerKey: null,
              });
            }
          } catch { /* skip failed seed */ }
        }),
      );

      const sorted = results.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
      const pageItems = sorted.slice(0, pageSize);
      const hasMore = sorted.length > pageSize || allLibrary.length > (page + 1) * 3;
      const translatedFallback = await translateMediaItems(ctx.db, pageItems, userLang);
      return { items: translatedFallback, nextCursor: hasMore ? page + 1 : null, version };
    }),
});
