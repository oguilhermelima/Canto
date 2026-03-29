import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  episode,
  extrasCache,
  media,
  season,
} from "@canto/db/schema";
import { getProvider, TmdbProvider } from "@canto/providers";
import type { NormalizedMedia } from "@canto/providers";
import { getSetting } from "@canto/db/settings";
import {
  addToLibraryInput,
  getByExternalInput,
  getByIdInput,
  searchInput,
} from "@canto/validators";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Persist normalized media + seasons + episodes into the database. */
async function persistMedia(
  db: import("@canto/db/client").Database,
  normalized: NormalizedMedia,
): Promise<typeof media.$inferSelect> {
  const [inserted] = await db
    .insert(media)
    .values({
      type: normalized.type,
      externalId: normalized.externalId,
      provider: normalized.provider,
      title: normalized.title,
      originalTitle: normalized.originalTitle,
      overview: normalized.overview,
      tagline: normalized.tagline,
      releaseDate: normalized.releaseDate,
      year: normalized.year,
      lastAirDate: normalized.lastAirDate,
      status: normalized.status,
      genres: normalized.genres,
      contentRating: normalized.contentRating,
      originalLanguage: normalized.originalLanguage,
      spokenLanguages: normalized.spokenLanguages,
      originCountry: normalized.originCountry,
      voteAverage: normalized.voteAverage,
      voteCount: normalized.voteCount,
      popularity: normalized.popularity,
      runtime: normalized.runtime,
      posterPath: normalized.posterPath,
      backdropPath: normalized.backdropPath,
      logoPath: normalized.logoPath,
      imdbId: normalized.imdbId,
      numberOfSeasons: normalized.numberOfSeasons,
      numberOfEpisodes: normalized.numberOfEpisodes,
      inProduction: normalized.inProduction,
      networks: normalized.networks,
      budget: normalized.budget,
      revenue: normalized.revenue,
      collection: normalized.collection,
      productionCompanies: normalized.productionCompanies,
      productionCountries: normalized.productionCountries,
      metadataUpdatedAt: new Date(),
    })
    .returning();

  if (!inserted) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to insert media",
    });
  }

  // Insert seasons + episodes for TV shows
  if (normalized.type === "show" && normalized.seasons) {
    for (const s of normalized.seasons) {
      const [insertedSeason] = await db
        .insert(season)
        .values({
          mediaId: inserted.id,
          number: s.number,
          externalId: s.externalId,
          name: s.name,
          overview: s.overview,
          airDate: s.airDate,
          posterPath: s.posterPath,
          episodeCount: s.episodeCount,
        })
        .returning();

      if (insertedSeason && s.episodes && s.episodes.length > 0) {
        await db.insert(episode).values(
          s.episodes.map((ep) => ({
            seasonId: insertedSeason.id,
            number: ep.number,
            externalId: ep.externalId,
            title: ep.title,
            overview: ep.overview,
            airDate: ep.airDate,
            runtime: ep.runtime,
            stillPath: ep.stillPath,
            voteAverage: ep.voteAverage,
          })),
        );
      }
    }
  }

  return inserted;
}

/** Update an existing media record with fresh normalized data. */
async function updateMediaFromNormalized(
  db: import("@canto/db/client").Database,
  mediaId: string,
  normalized: NormalizedMedia,
): Promise<typeof media.$inferSelect> {
  const [updated] = await db
    .update(media)
    .set({
      title: normalized.title,
      originalTitle: normalized.originalTitle,
      overview: normalized.overview,
      tagline: normalized.tagline,
      releaseDate: normalized.releaseDate,
      year: normalized.year,
      lastAirDate: normalized.lastAirDate,
      status: normalized.status,
      genres: normalized.genres,
      contentRating: normalized.contentRating,
      originalLanguage: normalized.originalLanguage,
      spokenLanguages: normalized.spokenLanguages,
      originCountry: normalized.originCountry,
      voteAverage: normalized.voteAverage,
      voteCount: normalized.voteCount,
      popularity: normalized.popularity,
      runtime: normalized.runtime,
      posterPath: normalized.posterPath,
      backdropPath: normalized.backdropPath,
      logoPath: normalized.logoPath,
      imdbId: normalized.imdbId,
      numberOfSeasons: normalized.numberOfSeasons,
      numberOfEpisodes: normalized.numberOfEpisodes,
      inProduction: normalized.inProduction,
      networks: normalized.networks,
      budget: normalized.budget,
      revenue: normalized.revenue,
      collection: normalized.collection,
      productionCompanies: normalized.productionCompanies,
      productionCountries: normalized.productionCountries,
      metadataUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId))
    .returning();

  if (!updated) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to update media",
    });
  }

  // For shows, update seasons + episodes
  if (normalized.type === "show" && normalized.seasons) {
    // Delete existing seasons (cascades to episodes)
    await db.delete(season).where(eq(season.mediaId, mediaId));

    for (const s of normalized.seasons) {
      const [insertedSeason] = await db
        .insert(season)
        .values({
          mediaId,
          number: s.number,
          externalId: s.externalId,
          name: s.name,
          overview: s.overview,
          airDate: s.airDate,
          posterPath: s.posterPath,
          episodeCount: s.episodeCount,
        })
        .returning();

      if (insertedSeason && s.episodes && s.episodes.length > 0) {
        await db.insert(episode).values(
          s.episodes.map((ep) => ({
            seasonId: insertedSeason.id,
            number: ep.number,
            externalId: ep.externalId,
            title: ep.title,
            overview: ep.overview,
            airDate: ep.airDate,
            runtime: ep.runtime,
            stillPath: ep.stillPath,
            voteAverage: ep.voteAverage,
          })),
        );
      }
    }
  }

  return updated;
}

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

// Cache staleness threshold: 7 days
const EXTRAS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function getProviderWithKey(name: "tmdb" | "anilist" | "tvdb"): ReturnType<typeof getProvider> {
  if (name === "tmdb") {
    const apiKey = (await getSetting("tmdb.apiKey")) ?? "";
    return getProvider(name, apiKey);
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
  addToLibrary: publicProcedure // TODO: switch to protectedProcedure when auth is implemented
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
  removeFromLibrary: publicProcedure // TODO: switch to protectedProcedure when auth is implemented
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
  updateMetadata: publicProcedure // TODO: protectedProcedure when auth ready
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
  delete: publicProcedure // TODO: protectedProcedure when auth ready
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
      const apiKey = (await getSetting("tmdb.apiKey")) ?? "";
      const provider = new TmdbProvider(apiKey);
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
      const apiKey = (await getSetting("tmdb.apiKey")) ?? "";
      const provider = new TmdbProvider(apiKey);
      return provider.getPerson(input.personId);
    }),

  /**
   * Get recommendations based on the user's library.
   * Picks random items from library, fetches TMDB recommendations, deduplicates.
   */
  recommendations: publicProcedure.query(async ({ ctx }) => {
    // Get up to 10 random library items
    const libraryItems = await ctx.db.query.media.findMany({
      where: eq(media.inLibrary, true),
      columns: {
        id: true,
        externalId: true,
        provider: true,
        type: true,
        title: true,
      },
      limit: 50,
    });

    if (libraryItems.length === 0) return [];

    // Pick up to 5 random seeds
    const shuffled = libraryItems.sort(() => Math.random() - 0.5).slice(0, 5);
    const apiKey = (await getSetting("tmdb.apiKey")) ?? "";
    if (!apiKey) return [];

    const tmdb = new TmdbProvider(apiKey);
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
      shuffled.map(async (item) => {
        try {
          const extras = await tmdb.getExtras(
            Number(item.externalId),
            item.type as "movie" | "show",
          );
          for (const rec of extras.recommendations ?? []) {
            const key = `${rec.provider ?? "tmdb"}-${rec.externalId}`;
            // Skip if already in library or already seen
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
          // Skip failed fetches
        }
      }),
    );

    // Sort by vote average, take top 20, then fetch logos
    const top = results
      .sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0))
      .slice(0, 20);

    // Fetch logos + trailers in parallel
    const enriched = await Promise.all(
      top.map(async (item) => {
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

          // Prefer official trailer, then any trailer, then teaser
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

    return enriched;
  }),
});
