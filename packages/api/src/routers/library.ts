import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { listInput } from "@canto/validators";

import { createTRPCRouter, adminProcedure, protectedProcedure, publicProcedure } from "../trpc";
import {
  findAllLibraries,
  findDefaultLibraries,
  findLibraryById,
  seedDefaultLibraries,
  setDefaultLibrary,
  updateLibrary,
  findUserPreferences,
  upsertUserPreference,
} from "../infrastructure/repositories/library-repository";
import { findLibraryStats, listLibraryMedia, updateMedia } from "../infrastructure/repositories/media-repository";

/* -------------------------------------------------------------------------- */
/*  Library Router                                                            */
/* -------------------------------------------------------------------------- */

export const libraryRouter = createTRPCRouter({
  /**
   * Paginated + filtered library listing.
   * Only returns items where downloaded = true.
   */
  list: publicProcedure.input(listInput).query(({ ctx, input }) =>
    listLibraryMedia(ctx.db, input),
  ),

  /**
   * Library statistics: counts of movies, shows, total, and storage usage.
   */
  stats: publicProcedure.query(({ ctx }) => findLibraryStats(ctx.db)),

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  Library config (the `library` table)                                     */
  /* ────────────────────────────────────────────────────────────────────────── */

  /**
   * Seed default libraries if none exist.
   */
  seed: adminProcedure.mutation(({ ctx }) => seedDefaultLibraries(ctx.db)),

  /**
   * List all library configs (the library table rows, not media items).
   */
  listLibraries: adminProcedure.query(({ ctx }) => findAllLibraries(ctx.db)),

  /**
   * Set a library as the default for its type (un-defaults the others of the same type).
   */
  setDefault: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const target = await findLibraryById(ctx.db, input.id);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Library not found" });
      }
      return setDefaultLibrary(ctx.db, input.id, target.type);
    }),

  /**
   * Toggle sync (media import) for a library.
   */
  toggleSync: adminProcedure
    .input(z.object({ id: z.string().uuid(), syncEnabled: z.boolean() }))
    .mutation(({ ctx, input }) =>
      updateLibrary(ctx.db, input.id, { syncEnabled: input.syncEnabled }),
    ),

  /**
   * Get the default library for each type.
   */
  getDefaults: adminProcedure.query(async ({ ctx }) => {
    const defaults = await findDefaultLibraries(ctx.db);
    const result: Record<string, typeof defaults[number]> = {};
    for (const lib of defaults) result[lib.type] = lib;
    return result;
  }),

  /**
   * Assign a specific library to a media item (override the default).
   */
  setMediaLibrary: adminProcedure
    .input(z.object({
      mediaId: z.string().uuid(),
      libraryId: z.string().uuid().nullable(),
    }))
    .mutation(({ ctx, input }) =>
      updateMedia(ctx.db, input.mediaId, { libraryId: input.libraryId }),
    ),

  setContinuousDownload: adminProcedure
    .input(z.object({
      mediaId: z.string().uuid(),
      enabled: z.boolean(),
    }))
    .mutation(({ ctx, input }) =>
      updateMedia(ctx.db, input.mediaId, { continuousDownload: input.enabled }),
    ),

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  User Preferences                                                         */
  /* ────────────────────────────────────────────────────────────────────────── */

  getPreferences: protectedProcedure.query(({ ctx }) =>
    findUserPreferences(ctx.db, ctx.session.user.id),
  ),

  setPreference: protectedProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserPreference(ctx.db, ctx.session.user.id, input.key, input.value);
      return { success: true };
    }),
});
