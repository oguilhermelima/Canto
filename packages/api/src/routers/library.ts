import { access, constants } from "node:fs/promises";
import nodePath from "node:path";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { listInput } from "@canto/validators";
import { getSetting, setSetting } from "@canto/db/settings";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import { SETTINGS } from "../lib/settings-keys";
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
import { getUserLanguage } from "../domain/services/user-service";
import { batchMediaTranslations } from "../domain/services/translation-service";
import { migrateToNewStructure } from "../domain/use-cases/migrate-library";

/* -------------------------------------------------------------------------- */
/*  Library Router                                                            */
/* -------------------------------------------------------------------------- */

export const libraryRouter = createTRPCRouter({
  /**
   * Paginated + filtered library listing.
   * Only returns items where downloaded = true.
   */
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const result = await listLibraryMedia(ctx.db, input);
    const userLang = await getUserLanguage(ctx.db, ctx.session.user.id);
    if (userLang.startsWith("en")) return result;

    const translations = await batchMediaTranslations(ctx.db, result.items.map((i) => i.id), userLang);
    const items = result.items.map((item) => {
      const t = translations.get(item.id);
      if (!t) return item;
      return {
        ...item,
        title: t.title ?? item.title,
        overview: t.overview ?? item.overview,
        posterPath: t.posterPath ?? item.posterPath,
        logoPath: t.logoPath ?? item.logoPath,
      };
    });
    return { ...result, items };
  }),

  /**
   * Library statistics: counts of movies, shows, total, and storage usage.
   */
  stats: protectedProcedure.query(({ ctx }) => findLibraryStats(ctx.db)),

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

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  Path configuration                                                       */
  /* ────────────────────────────────────────────────────────────────────────── */

  /**
   * Get the root data path setting.
   */
  getRootPath: adminProcedure.query(async () => {
    const value = await getSetting<string>(SETTINGS.ROOT_DATA_PATH);
    return value ?? "/data";
  }),

  /**
   * Set the root data path and auto-derive download/library paths for all libraries.
   */
  setRootPath: adminProcedure
    .input(z.object({ path: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const rootPath = validatePath(input.path);
      await setSetting(SETTINGS.ROOT_DATA_PATH, rootPath);

      const libs = await findAllLibraries(ctx.db);
      for (const lib of libs) {
        const category = lib.qbitCategory ?? lib.type;
        await updateLibrary(ctx.db, lib.id, {
          downloadPath: `${rootPath}/torrents/${category}`,
          libraryPath: `${rootPath}/media/${lib.name.toLowerCase()}`,
        });
      }

      return { updated: libs.length };
    }),

  /**
   * Update download/library paths for a specific library.
   */
  updatePaths: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      downloadPath: z.string().min(1).optional(),
      libraryPath: z.string().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const lib = await findLibraryById(ctx.db, input.id);
      if (!lib) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found" });

      return updateLibrary(ctx.db, input.id, {
        ...(input.downloadPath !== undefined ? { downloadPath: validatePath(input.downloadPath) } : {}),
        ...(input.libraryPath !== undefined ? { libraryPath: validatePath(input.libraryPath) } : {}),
      });
    }),

  /**
   * Test that configured paths exist and are writable.
   */
  testPaths: adminProcedure.mutation(async ({ ctx }) => {
    const libs = await findAllLibraries(ctx.db);
    const results: Array<{ name: string; downloadPath: { ok: boolean; error?: string }; libraryPath: { ok: boolean; error?: string } }> = [];

    for (const lib of libs) {
      const dlResult = await testPath(lib.downloadPath);
      const libResult = await testPath(lib.libraryPath);
      results.push({ name: lib.name, downloadPath: dlResult, libraryPath: libResult });
    }

    return results;
  }),

  /**
   * Get download settings (seed management).
   */
  getDownloadSettings: adminProcedure.query(async () => {
    const [importMethod, seedRatio, seedTime, seedCleanup] = await Promise.all([
      getSetting<string>(SETTINGS.IMPORT_METHOD),
      getSetting<number>(SETTINGS.SEED_RATIO_LIMIT),
      getSetting<number>(SETTINGS.SEED_TIME_LIMIT_HOURS),
      getSetting<boolean>(SETTINGS.SEED_CLEANUP_FILES),
    ]);
    return {
      importMethod: (importMethod ?? "local") as "local" | "remote",
      seedRatioLimit: seedRatio ?? null,
      seedTimeLimitHours: seedTime ?? null,
      seedCleanupFiles: seedCleanup ?? false,
    };
  }),

  /**
   * Save download settings.
   */
  setDownloadSettings: adminProcedure
    .input(z.object({
      importMethod: z.enum(["local", "remote"]),
      seedRatioLimit: z.number().min(0).nullable(),
      seedTimeLimitHours: z.number().min(0).nullable(),
      seedCleanupFiles: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      await Promise.all([
        setSetting(SETTINGS.IMPORT_METHOD, input.importMethod),
        setSetting(SETTINGS.SEED_RATIO_LIMIT, input.seedRatioLimit),
        setSetting(SETTINGS.SEED_TIME_LIMIT_HOURS, input.seedTimeLimitHours),
        setSetting(SETTINGS.SEED_CLEANUP_FILES, input.seedCleanupFiles),
      ]);
      return { success: true };
    }),
  /**
   * Migrate existing files to the new /data structure.
   */
  migrateToNewStructure: adminProcedure
    .input(z.object({ rootPath: z.string().min(1).default("/data") }))
    .mutation(({ ctx, input }) => migrateToNewStructure(ctx.db, input.rootPath)),
});

function validatePath(p: string): string {
  const normalized = nodePath.normalize(p);
  if (normalized.includes("..")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Path "${p}" contains invalid traversal segments` });
  }
  if (!nodePath.isAbsolute(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Path "${p}" must be absolute` });
  }
  return normalized;
}

async function testPath(p: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!p) return { ok: false, error: "Not configured" };
  try {
    await access(p, constants.R_OK | constants.W_OK);
    return { ok: true };
  } catch {
    return { ok: false, error: `Path "${p}" is not accessible or writable` };
  }
}
