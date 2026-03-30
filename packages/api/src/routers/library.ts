import { TRPCError } from "@trpc/server";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { library, media, mediaFile, userPreference } from "@canto/db/schema";
import { listInput } from "@canto/validators";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { listLibraryMedia } from "../domain/use-cases/list-library-media";

/* -------------------------------------------------------------------------- */
/*  Library Router                                                            */
/* -------------------------------------------------------------------------- */

export const libraryRouter = createTRPCRouter({
  /**
   * Paginated + filtered library listing.
   * Only returns items where in_library = true.
   */
  list: publicProcedure.input(listInput).query(({ ctx, input }) =>
    listLibraryMedia(ctx.db, input),
  ),

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
   * Toggle sync (media import) for a library.
   */
  toggleSync: publicProcedure
    .input(z.object({ id: z.string().uuid(), syncEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(library)
        .set({ syncEnabled: input.syncEnabled, updatedAt: new Date() })
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
