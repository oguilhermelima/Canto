import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  extrasCache,
  media,
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

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

// Cache staleness threshold: 7 days
const EXTRAS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
  search: publicProcedure.input(searchInput).query(async ({ input }) => {
    const provider = await getProviderWithKey(input.provider);
    const page = input.cursor ?? input.page;
    return provider.search(input.query, input.type, {
      page,
    });
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

      if (existing) return existing;

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
   * Cached in extras_cache table; re-fetches if stale (>7 days).
   */
  getExtras: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Look up the media record to get external_id and provider
      const row = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.id),
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media not found",
        });
      }

      // Check extras cache
      const cached = await ctx.db.query.extrasCache.findFirst({
        where: eq(extrasCache.mediaId, input.id),
      });

      if (cached) {
        const age = Date.now() - new Date(cached.updatedAt).getTime();
        if (age < EXTRAS_CACHE_MAX_AGE_MS) {
          return cached.data as import("@canto/providers").MediaExtras;
        }
      }

      // Fetch fresh extras from provider
      const provider = await getProviderWithKey(row.provider as "tmdb" | "anilist" | "tvdb");
      const extras = await provider.getExtras(
        row.externalId,
        row.type as "movie" | "show",
      );

      // Upsert cache
      if (cached) {
        await ctx.db
          .update(extrasCache)
          .set({ data: extras, updatedAt: new Date() })
          .where(eq(extrasCache.id, cached.id));
      } else {
        await ctx.db.insert(extrasCache).values({
          mediaId: input.id,
          data: extras,
        });
      }

      return extras;
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
    .query(async ({ input }) => {
      const provider = await getTmdbProvider();
      const page = input.cursor ?? input.page;

      if (input.mode === "trending") {
        // If genre/language filters are set, use filtered trending (fetches multiple pages)
        if (input.genres || input.language) {
          return provider.getTrendingFiltered(input.type, {
            page,
            genreIds: input.genres ? input.genres.split(",").map(Number) : undefined,
            language: input.language,
          });
        }
        return provider.getTrending(input.type, { page });
      }

      // Discover mode — pass all filters to TMDB Discover API
      return provider.discover(input.type, {
        page,
        with_genres: input.genres,
        with_original_language: input.language,
        sort_by: input.sortBy ?? "popularity.desc",
        first_air_date_gte: input.type === "show" ? input.dateFrom : undefined,
        release_date_gte: input.type === "movie" ? input.dateFrom : undefined,
      });
    }),

  /**
   * Get person detail from TMDB (biography, credits, images).
   */
  getPerson: publicProcedure
    .input(z.object({ personId: z.number() }))
    .query(async ({ input }) => {
      const provider = await getTmdbProvider();
      return provider.getPerson(input.personId);
    }),

  /**
   * Get recommendations based on the user's library.
   * Picks random items from library, fetches TMDB recommendations, deduplicates.
   */
  recommendations: publicProcedure
    .input(z.object({
      cursor: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(20).default(10),
    }).optional())
    .query(async ({ ctx, input }) => {
    const page = input?.cursor ?? 0;
    const pageSize = input?.pageSize ?? 10;

    const libraryItems = await ctx.db.query.media.findMany({
      where: eq(media.inLibrary, true),
      columns: {
        id: true,
        externalId: true,
        provider: true,
        type: true,
        title: true,
      },
      limit: 100,
    });

    if (libraryItems.length === 0) return { items: [], nextCursor: null };

    // Use page as seed offset — pick different items per page
    const seedStart = (page * 3) % libraryItems.length;
    const seeds: typeof libraryItems = [];
    for (let i = 0; i < 3 && i < libraryItems.length; i++) {
      seeds.push(libraryItems[(seedStart + i) % libraryItems.length]!);
    }

    const tmdb = await getTmdbProvider();
    const libraryExternalIds = new Set(libraryItems.map((m) => `${m.provider}-${m.externalId}`));
    const seen = new Set<string>();
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
            if (libraryExternalIds.has(key) || seen.has(key)) continue;
            seen.add(key);
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
            });
          }
        } catch {
          // Skip
        }
      }),
    );

    // Sort by vote average, paginate
    const sorted = results.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
    const pageItems = sorted.slice(0, pageSize);
    const hasMore = sorted.length > pageSize || libraryItems.length > (page + 1) * 3;

    // Fetch logos + trailers in parallel
    const enriched = await Promise.all(
      pageItems.map(async (item) => {
        const tmdbType = item.type === "show" ? "tv" : "movie";
        let logoPath: string | null = null;
        let trailerKey: string | null = null;

        try {
          const [images, videos] = await Promise.all([
            tmdb.getImages(Number(item.externalId), tmdbType),
            tmdb.getVideos(Number(item.externalId), tmdbType),
          ]);

          const enLogos = (images.logos ?? []).filter(
            (l: { iso_639_1: string | null }) => l.iso_639_1 === "en",
          );
          if (enLogos.length > 0) logoPath = enLogos[0]!.file_path;

          const trailer =
            videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
            videos.find((v) => v.site === "YouTube" && v.type === "Teaser") ??
            null;
          if (trailer) trailerKey = trailer.key;
        } catch {
          // Skip
        }

        return { ...item, logoPath, trailerKey };
      }),
    );

    return {
      items: enriched,
      nextCursor: hasMore ? page + 1 : null,
    };
  }),
});
