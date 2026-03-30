import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getProvider } from "@canto/providers";
import { persistMedia, updateMediaFromNormalized } from "@canto/db/persist-media";
import {
  addToLibraryInput,
  getByExternalInput,
  getByIdInput,
} from "@canto/validators";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { getTmdbProvider } from "../lib/tmdb-client";
import { dispatchRefreshExtras } from "../infrastructure/queue/bullmq-dispatcher";
import { cached } from "../infrastructure/cache/redis";
import {
  findMediaById,
  findMediaByIdWithSeasons,
  findMediaByExternalId,
  updateMedia,
  deleteMedia,
  findLibraryExternalIds,
  findLibraryMediaBrief,
} from "../infrastructure/repositories/media-repository";
import { findMediaFilesByMediaId } from "../infrastructure/repositories/media-file-repository";
import {
  findCreditsByMediaId,
  findVideosByMediaId,
  findWatchProvidersByMediaId,
  findPoolBySource,
  findPoolRecommendations,
} from "../infrastructure/repositories/extras-repository";

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
      page: z.number().int().min(1).default(1),
      cursor: z.number().int().positive().nullish(),
    }))
    .query(({ input }) => {
      const page = input.cursor ?? input.page;

      if (input.mode === "search") {
        if (!input.query) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Query is required for search mode" });
        }
        return cached(
          `browse:search:${input.provider}:${input.type}:${input.query}:${page}`,
          300,
          async () => {
            const provider = await getProviderWithKey(input.provider);
            return provider.search(input.query!, input.type, { page });
          },
        );
      }

      const cacheKey = `browse:${input.type}:${input.mode}:${input.genres ?? ""}:${input.language ?? ""}:${input.sortBy ?? ""}:${input.dateFrom ?? ""}:${page}`;

      return cached(cacheKey, 300, async () => {
        const provider = await getTmdbProvider();

        if (input.mode === "trending") {
          if (input.genres || input.language) {
            return provider.getTrendingFiltered(input.type, {
              page,
              genreIds: input.genres ? input.genres.split(",").map(Number) : undefined,
              language: input.language,
            });
          }
          return provider.getTrending(input.type, { page });
        }

        // mode === "discover"
        return provider.discover(input.type, {
          page,
          with_genres: input.genres,
          with_original_language: input.language,
          sort_by: input.sortBy ?? "popularity.desc",
          first_air_date_gte: input.type === "show" ? input.dateFrom : undefined,
          release_date_gte: input.type === "movie" ? input.dateFrom : undefined,
        });
      });
    }),

  /**
   * Get media from DB by its internal UUID.
   * Returns the media row with seasons and episodes.
   */
  getById: publicProcedure.input(getByIdInput).query(async ({ ctx, input }) => {
    const row = await findMediaByIdWithSeasons(ctx.db, input.id);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
    return row;
  }),

  /**
   * "Persist on visit" — check DB first, otherwise fetch from provider and
   * insert media + seasons + episodes, then return the DB record.
   */
  getByExternal: publicProcedure
    .input(getByExternalInput)
    .query(async ({ ctx, input }) => {
      const existing = await findMediaByExternalId(ctx.db, input.externalId, input.provider);

      if (existing) {
        if (existing.inLibrary) {
          const STALE_MS = 30 * 24 * 60 * 60 * 1000;
          const isStale =
            !existing.extrasUpdatedAt ||
            Date.now() - existing.extrasUpdatedAt.getTime() > STALE_MS;
          if (isStale) void dispatchRefreshExtras(existing.id).catch(() => {});
        }
        return existing;
      }

      const provider = await getProviderWithKey(input.provider);
      const normalized = await provider.getMetadata(input.externalId, input.type);
      const inserted = await persistMedia(ctx.db, normalized);
      const result = await findMediaByIdWithSeasons(ctx.db, inserted.id);
      return result!;
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
        findPoolBySource(ctx.db, input.id, "similar"),
        findPoolBySource(ctx.db, input.id, "recommendation"),
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

        const mapPoolToSearchResult = (item: typeof similar[number]) => ({
          externalId: item.tmdbId,
          provider: "tmdb" as const,
          type: item.mediaType as "movie" | "show",
          title: item.title,
          overview: item.overview ?? undefined,
          posterPath: item.posterPath ?? undefined,
          backdropPath: item.backdropPath ?? undefined,
          releaseDate: item.releaseDate ?? undefined,
          year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined,
          voteAverage: item.voteAverage ?? undefined,
        });

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

        return {
          credits: { cast, crew },
          similar: similar.map(mapPoolToSearchResult),
          recommendations: recommendations.map(mapPoolToSearchResult),
          videos: videos.map((v) => ({
            id: v.id,
            key: v.externalKey,
            name: v.name,
            site: v.site,
            type: v.type,
            official: v.official,
          })),
          watchProviders: wpByRegion,
        };
      }

      // New tables empty — dispatch background refresh and return empty for now
      void dispatchRefreshExtras(input.id).catch(() => {});

      // Fetch from TMDB directly as one-time response (next call will have new tables populated)
      const provider = await getProviderWithKey(row.provider as "tmdb" | "anilist" | "tvdb");
      return provider.getExtras(
        row.externalId,
        row.type as "movie" | "show",
      );
    }),

  /**
   * Add media to the user's library.
   */
  addToLibrary: protectedProcedure
    .input(addToLibraryInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await updateMedia(ctx.db, input.id, {
        inLibrary: true,
        addedAt: new Date(),
      });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      void dispatchRefreshExtras(updated.id).catch(() => {});
      return updated;
    }),

  /**
   * Remove media from the user's library.
   */
  removeFromLibrary: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await updateMedia(ctx.db, input.id, { inLibrary: false, addedAt: null });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return updated;
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
      const normalized = await provider.getMetadata(row.externalId, row.type as "movie" | "show");
      return updateMediaFromNormalized(ctx.db, input.id, normalized);
    }),

  /**
   * Hard delete a media record (cascades to seasons, episodes, files, cache).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteMedia(ctx.db, input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return { success: true };
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
   * Get recommendations based on the user's library.
   * Reads from recommendation_pool (pre-computed).
   * Falls back to TMDB if pool is empty (no library items with extras).
   */
  recommendations: publicProcedure
    .input(z.object({
      cursor: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(20).default(10),
    }).optional())
    .query(async ({ ctx, input }) => {
      const page = input?.cursor ?? 0;
      const pageSize = input?.pageSize ?? 10;
      const offset = page * pageSize;

      const libraryItems = await findLibraryExternalIds(ctx.db);
      const libraryTmdbIds = libraryItems.map((m) => m.externalId);
      const poolItems = await findPoolRecommendations(ctx.db, libraryTmdbIds, pageSize + 1, offset);

      if (poolItems.length > 0) {
        // Deduplicate by tmdbId (same media can be recommended by multiple sources)
        const seen = new Set<number>();
        const unique = poolItems.filter((item) => {
          if (seen.has(item.tmdbId)) return false;
          seen.add(item.tmdbId);
          return true;
        });

        const hasMore = unique.length > pageSize;
        const items = unique.slice(0, pageSize).map((item) => ({
          externalId: item.tmdbId,
          provider: "tmdb",
          type: item.mediaType as "movie" | "show",
          title: item.title,
          posterPath: item.posterPath ?? null,
          backdropPath: item.backdropPath ?? null,
          year: item.releaseDate ? new Date(item.releaseDate).getFullYear() : undefined,
          voteAverage: item.voteAverage ?? undefined,
          overview: item.overview ?? undefined,
          logoPath: item.logoPath ?? null,
          trailerKey: null as string | null,
        }));

        return { items, nextCursor: hasMore ? page + 1 : null };
      }

      // Fallback: TMDB (pool empty — no library items with refresh-extras yet)
      if (libraryItems.length === 0) return { items: [], nextCursor: null };

      const allLibrary = await findLibraryMediaBrief(ctx.db);

      const seedStart = (page * 3) % allLibrary.length;
      const seeds: typeof allLibrary = [];
      for (let i = 0; i < 3 && i < allLibrary.length; i++) {
        seeds.push(allLibrary[(seedStart + i) % allLibrary.length]!);
      }

      const tmdb = await getTmdbProvider();
      const libraryKeys = new Set(allLibrary.map((m) => `${m.provider}-${m.externalId}`));
      const seenKeys = new Set<string>();
      const results: Array<{
        externalId: number;
        provider: string;
        type: "movie" | "show";
        title: string;
        posterPath: string | null;
        backdropPath: string | null;
        year: number | undefined;
        voteAverage: number | undefined;
        overview: string | undefined;
        logoPath: string | null;
        trailerKey: string | null;
      }> = [];

      await Promise.all(
        seeds.map(async (item) => {
          try {
            const extras = await tmdb.getExtras(
              Number(item.externalId),
              item.type as "movie" | "show",
            );
            for (const rec of extras.recommendations ?? []) {
              const key = `${rec.provider ?? "tmdb"}-${rec.externalId}`;
              if (libraryKeys.has(key) || seenKeys.has(key)) continue;
              seenKeys.add(key);
              results.push({
                externalId: rec.externalId,
                provider: rec.provider ?? "tmdb",
                type: (rec.type ?? item.type) as "movie" | "show",
                title: rec.title,
                posterPath: rec.posterPath ?? null,
                backdropPath: rec.backdropPath ?? null,
                year: rec.year,
                voteAverage: rec.voteAverage,
                overview: rec.overview,
                logoPath: null,
                trailerKey: null,
              });
            }
          } catch {
            // Skip failed seed
          }
        }),
      );

      const sorted = results.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
      const pageItems = sorted.slice(0, pageSize);
      const hasMore = sorted.length > pageSize || allLibrary.length > (page + 1) * 3;

      return {
        items: pageItems,
        nextCursor: hasMore ? page + 1 : null,
      };
    }),
});
