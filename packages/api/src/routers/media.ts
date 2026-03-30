import { TRPCError } from "@trpc/server";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";

import {
  media,
  mediaCredit,
  mediaFile,
  mediaVideo,
  mediaWatchProvider,
  recommendationPool,
  season,
} from "@canto/db/schema";
import { getProvider } from "@canto/providers";
import type { NormalizedMedia } from "@canto/providers";
import { persistMedia, updateMediaFromNormalized } from "@canto/db/persist-media";
import {
  addToLibraryInput,
  getByExternalInput,
  getByIdInput,
  searchInput,
} from "@canto/validators";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { getTmdbProvider } from "../lib/tmdb-client";
import { dispatchRefreshExtras } from "../infrastructure/queue/bullmq-dispatcher";
import { cached } from "../infrastructure/cache/redis";

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
   * Search for media via external provider (nothing saved to DB).
   */
  search: publicProcedure.input(searchInput).query(({ input }) => {
    const page = input.cursor ?? input.page;
    return cached(
      `search:${input.provider}:${input.type}:${input.query}:${page}`,
      300,
      async () => {
        const provider = await getProviderWithKey(input.provider);
        return provider.search(input.query, input.type, { page });
      },
    );
  }),

  /**
   * Get media from DB by its internal UUID.
   * Returns the media row with seasons and episodes.
   */
  getById: publicProcedure.input(getByIdInput).query(async ({ ctx, input }) => {
    const row = await ctx.db.query.media.findFirst({
      where: eq(media.id, input.id),
      with: {
        seasons: {
          orderBy: (s, { asc }) => [asc(s.number)],
          with: {
            episodes: {
              orderBy: (e, { asc }) => [asc(e.number)],
            },
          },
        },
      },
    });

    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
    }

    return row;
  }),

  /**
   * "Persist on visit" — check DB first, otherwise fetch from provider and
   * insert media + seasons + episodes, then return the DB record.
   */
  getByExternal: publicProcedure
    .input(getByExternalInput)
    .query(async ({ ctx, input }) => {
      // 1. Check if already in DB
      const existing = await ctx.db.query.media.findFirst({
        where: and(
          eq(media.externalId, input.externalId),
          eq(media.provider, input.provider),
        ),
        with: {
          seasons: {
            orderBy: (s, { asc }) => [asc(s.number)],
            with: {
              episodes: {
                orderBy: (e, { asc }) => [asc(e.number)],
              },
            },
          },
        },
      });

      if (existing) {
        // Stale-while-revalidate: dispatch background refresh if extras are old
        if (existing.inLibrary) {
          const STALE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
          const isStale =
            !existing.extrasUpdatedAt ||
            Date.now() - existing.extrasUpdatedAt.getTime() > STALE_MS;
          if (isStale) {
            void dispatchRefreshExtras(existing.id).catch(() => {});
          }
        }
        return existing;
      }

      // 2. Fetch full metadata from provider
      const provider = await getProviderWithKey(input.provider);
      const normalized = await provider.getMetadata(
        input.externalId,
        input.type,
      );

      // 3. Persist to DB
      const inserted = await persistMedia(ctx.db, normalized);

      // 4. Re-fetch with relations
      const result = await ctx.db.query.media.findFirst({
        where: eq(media.id, inserted.id),
        with: {
          seasons: {
            orderBy: (s, { asc }) => [asc(s.number)],
            with: {
              episodes: {
                orderBy: (e, { asc }) => [asc(e.number)],
              },
            },
          },
        },
      });

      return result!;
    }),

  /**
   * Get extras (credits, similar, recommendations, videos, watch providers).
   * Reads from dedicated tables (populated by refresh-extras job).
   * Falls back to extrasCache or TMDB if new tables are empty.
   */
  getExtras: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.id),
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media not found",
        });
      }

      // Try reading from new dedicated tables
      const [credits, videos, watchProviders, similar, recommendations] = await Promise.all([
        ctx.db.query.mediaCredit.findMany({
          where: eq(mediaCredit.mediaId, input.id),
          orderBy: (c, { asc }) => [asc(c.order)],
        }),
        ctx.db.query.mediaVideo.findMany({
          where: eq(mediaVideo.mediaId, input.id),
        }),
        ctx.db.query.mediaWatchProvider.findMany({
          where: eq(mediaWatchProvider.mediaId, input.id),
        }),
        ctx.db.query.recommendationPool.findMany({
          where: and(
            eq(recommendationPool.sourceMediaId, input.id),
            eq(recommendationPool.sourceType, "similar"),
          ),
        }),
        ctx.db.query.recommendationPool.findMany({
          where: and(
            eq(recommendationPool.sourceMediaId, input.id),
            eq(recommendationPool.sourceType, "recommendation"),
          ),
        }),
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
      const [updated] = await ctx.db
        .update(media)
        .set({
          inLibrary: true,
          addedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(media.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media not found",
        });
      }

      // Populate recommendation pool + extras in background
      void dispatchRefreshExtras(updated.id).catch(() => {});

      return updated;
    }),

  /**
   * Remove media from the user's library.
   */
  removeFromLibrary: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(media)
        .set({
          inLibrary: false,
          addedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(media.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media not found",
        });
      }

      return updated;
    }),

  /**
   * Re-fetch metadata from the original provider and update the DB record.
   */
  updateMetadata: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.id),
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media not found",
        });
      }

      const provider = await getProviderWithKey(
        row.provider as "tmdb" | "anilist" | "tvdb",
      );
      const normalized = await provider.getMetadata(
        row.externalId,
        row.type as "movie" | "show",
      );

      return updateMediaFromNormalized(ctx.db, input.id, normalized);
    }),

  /**
   * Hard delete a media record (cascades to seasons, episodes, files, cache).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(media)
        .where(eq(media.id, input.id))
        .returning();

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media not found",
        });
      }

      return { success: true };
    }),

  /**
   * List media files (on disk) for a given media, with episode and torrent info.
   */
  listFiles: publicProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.mediaFile.findMany({
        where: eq(mediaFile.mediaId, input.mediaId),
        with: {
          episode: {
            columns: { id: true, number: true, title: true, seasonId: true },
            with: {
              season: { columns: { id: true, number: true } },
            },
          },
          torrent: {
            columns: { id: true, quality: true, source: true, title: true },
          },
        },
        orderBy: (f, { asc }) => [asc(f.createdAt)],
      });
    }),

  /**
   * Unified discover endpoint. Supports:
   * - mode "trending": TMDB /trending endpoint (default)
   * - mode "discover": TMDB /discover endpoint (genre, language, sort filters)
   * - genre/language filters: applied server-side on trending, or as API params on discover
   */
  discover: publicProcedure
    .input(
      z.object({
        type: z.enum(["movie", "show"]),
        mode: z.enum(["trending", "discover"]).default("trending"),
        genres: z.string().optional(),
        language: z.string().optional(),
        sortBy: z.string().optional(),
        dateFrom: z.string().optional(),
        page: z.number().int().min(1).default(1),
        cursor: z.number().int().positive().nullish(),
      }),
    )
    .query(({ input }) => {
      const page = input.cursor ?? input.page;
      const cacheKey = `discover:${input.type}:${input.mode}:${input.genres ?? ""}:${input.language ?? ""}:${input.sortBy ?? ""}:${input.dateFrom ?? ""}:${page}`;

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

      // Get library external IDs to exclude items already in library
      const libraryItems = await ctx.db.query.media.findMany({
        where: eq(media.inLibrary, true),
        columns: { externalId: true },
      });

      const libraryTmdbIds = libraryItems.map((m) => m.externalId);

      // Query pool, excluding library items, ordered by score
      const poolItems = libraryTmdbIds.length > 0
        ? await ctx.db.query.recommendationPool.findMany({
            where: notInArray(recommendationPool.tmdbId, libraryTmdbIds),
            orderBy: [desc(recommendationPool.score)],
            limit: pageSize + 1,
            offset,
          })
        : await ctx.db.query.recommendationPool.findMany({
            orderBy: [desc(recommendationPool.score)],
            limit: pageSize + 1,
            offset,
          });

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

      const allLibrary = await ctx.db.query.media.findMany({
        where: eq(media.inLibrary, true),
        columns: { id: true, externalId: true, provider: true, type: true },
        limit: 100,
      });

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
