import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { library, media, mediaFile, userPreference } from "@canto/db/schema";
import { listInput } from "@canto/validators";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

/* -------------------------------------------------------------------------- */
/*  Library Router                                                            */
/* -------------------------------------------------------------------------- */

export const libraryRouter = createTRPCRouter({
  /**
   * Paginated + filtered library listing.
   * Only returns items where in_library = true.
   */
  list: publicProcedure.input(listInput).query(async ({ ctx, input }) => {
    const page = input.page;
    const pageSize = input.pageSize;
    const offset = (page - 1) * pageSize;

    // Build WHERE conditions
    const conditions = [eq(media.inLibrary, true)];

    if (input.type) {
      conditions.push(eq(media.type, input.type));
    }

    if (input.genre) {
      conditions.push(
        sql`${media.genres}::jsonb @> ${JSON.stringify([input.genre])}::jsonb`,
      );
    }

    if (input.status) {
      conditions.push(eq(media.status, input.status));
    }

    if (input.yearMin) {
      conditions.push(gte(media.year, input.yearMin));
    }

    if (input.yearMax) {
      conditions.push(lte(media.year, input.yearMax));
    }

    if (input.language) {
      conditions.push(eq(media.originalLanguage, input.language));
    }

    if (input.scoreMin) {
      conditions.push(gte(media.voteAverage, input.scoreMin));
    }

    if (input.runtimeMax) {
      conditions.push(lte(media.runtime, input.runtimeMax));
    }

    if (input.contentRating) {
      conditions.push(eq(media.contentRating, input.contentRating));
    }

    if (input.network) {
      conditions.push(
        sql`${media.networks}::jsonb @> ${JSON.stringify([input.network])}::jsonb`,
      );
    }

    if (input.provider) {
      conditions.push(eq(media.provider, input.provider));
    }

    if (input.search) {
      conditions.push(ilike(media.title, `%${input.search}%`));
    }

    if (input.downloaded !== undefined) {
      if (input.downloaded) {
        conditions.push(
          sql`EXISTS (SELECT 1 FROM ${mediaFile} WHERE ${mediaFile.mediaId} = ${media.id})`,
        );
      } else {
        conditions.push(
          sql`NOT EXISTS (SELECT 1 FROM ${mediaFile} WHERE ${mediaFile.mediaId} = ${media.id})`,
        );
      }
    }

    const where = and(...conditions);

    // Determine sort direction
    const orderFn = input.sortOrder === "asc" ? asc : desc;

    // Build order by clause based on sort field
    function getOrderBy() {
      switch (input.sortBy) {
        case "title":
          return [orderFn(media.title)];
        case "year":
          return [orderFn(media.year)];
        case "voteAverage":
          return [orderFn(media.voteAverage)];
        case "popularity":
          return [orderFn(media.popularity)];
        case "releaseDate":
          return [orderFn(media.releaseDate)];
        case "addedAt":
        default:
          return [orderFn(media.addedAt)];
      }
    }

    // Execute queries in parallel
    const [items, [totalRow]] = await Promise.all([
      ctx.db.query.media.findMany({
        where,
        orderBy: getOrderBy(),
        limit: pageSize,
        offset,
      }),
      ctx.db.select({ total: count() }).from(media).where(where),
    ]);

    const total = totalRow?.total ?? 0;

    return {
      items,
      total,
      page,
      pageSize,
    };
  }),

  /**
   * Library statistics: counts of movies, shows, total, and storage usage.
   */
  stats: publicProcedure.query(async ({ ctx }) => {
    const [totalRow] = await ctx.db
      .select({ total: count() })
      .from(media)
      .where(eq(media.inLibrary, true));

    const [moviesRow] = await ctx.db
      .select({ total: count() })
      .from(media)
      .where(and(eq(media.inLibrary, true), eq(media.type, "movie")));

    const [showsRow] = await ctx.db
      .select({ total: count() })
      .from(media)
      .where(and(eq(media.inLibrary, true), eq(media.type, "show")));

    const [storageRow] = await ctx.db
      .select({
        totalBytes: sql<string>`COALESCE(SUM(${mediaFile.sizeBytes}), 0)`,
      })
      .from(mediaFile);

    return {
      total: totalRow?.total ?? 0,
      movies: moviesRow?.total ?? 0,
      shows: showsRow?.total ?? 0,
      storageBytes: BigInt(storageRow?.totalBytes ?? "0"),
    };
  }),

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  Library config (the `library` table)                                     */
  /* ────────────────────────────────────────────────────────────────────────── */

  /**
   * Seed default libraries if none exist.
   */
  seed: publicProcedure.mutation(async ({ ctx }) => {
    const existing = await ctx.db.query.library.findMany();
    if (existing.length > 0) {
      return existing;
    }

    const defaults = [
      {
        name: "Movies",
        type: "movies",
        jellyfinPath: "/media/Movies",
        qbitCategory: "movies",
        isDefault: true,
      },
      {
        name: "Shows",
        type: "shows",
        jellyfinPath: "/media/Shows",
        qbitCategory: "shows",
        isDefault: true,
      },
      {
        name: "Animes",
        type: "animes",
        jellyfinPath: "/media/Animes",
        qbitCategory: "animes",
        isDefault: true,
      },
    ] as const;

    const inserted = await ctx.db
      .insert(library)
      .values([...defaults])
      .returning();

    return inserted;
  }),

  /**
   * List all library configs (the library table rows, not media items).
   */
  listLibraries: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.library.findMany({
      orderBy: (l, { asc: a }) => [a(l.type), a(l.name)],
    });
  }),

  /**
   * Set a library as the default for its type (un-defaults the others of the same type).
   */
  setDefault: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.query.library.findFirst({
        where: eq(library.id, input.id),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Library not found" });
      }

      // Un-default all libraries of the same type
      await ctx.db
        .update(library)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(library.type, target.type));

      // Set the target as default
      const [updated] = await ctx.db
        .update(library)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(library.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Get the default library for each type.
   */
  getDefaults: publicProcedure.query(async ({ ctx }) => {
    const defaults = await ctx.db.query.library.findMany({
      where: eq(library.isDefault, true),
    });

    const result: Record<string, typeof defaults[number]> = {};
    for (const lib of defaults) {
      result[lib.type] = lib;
    }
    return result;
  }),

  /**
   * Assign a specific library to a media item (override the default).
   */
  setMediaLibrary: publicProcedure
    .input(
      z.object({
        mediaId: z.string().uuid(),
        libraryId: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(media)
        .set({ libraryId: input.libraryId, updatedAt: new Date() })
        .where(eq(media.id, input.mediaId))
        .returning();

      return updated;
    }),

  setContinuousDownload: publicProcedure
    .input(z.object({
      mediaId: z.string().uuid(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(media)
        .set({ continuousDownload: input.enabled, updatedAt: new Date() })
        .where(eq(media.id, input.mediaId))
        .returning();
      return updated;
    }),

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  User Preferences                                                         */
  /* ────────────────────────────────────────────────────────────────────────── */

  /** Get all user preferences */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.userPreference.findMany({
      where: eq(userPreference.userId, ctx.session.user.id),
    });
    const prefs: Record<string, unknown> = {};
    for (const row of rows) {
      prefs[row.key] = row.value;
    }
    // Apply defaults
    return {
      autoMergeVersions: true,
      defaultQuality: "fullhd",
      ...prefs,
    };
  }),

  /** Set a user preference */
  setPreference: protectedProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(userPreference)
        .values({
          userId: ctx.session.user.id,
          key: input.key,
          value: input.value,
        })
        .onConflictDoUpdate({
          target: [userPreference.userId, userPreference.key],
          set: { value: input.value },
        });
      return { success: true };
    }),
});
