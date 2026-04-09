import {
  listInput,
  setMediaLibraryInput,
  setContinuousDownloadInput,
  setPreferenceInput,
  setDownloadSettingsInput,
} from "@canto/validators";
import { getSetting, setSetting } from "@canto/db/settings";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import { SETTINGS } from "@canto/core/lib/settings-keys";
import {
  findUserPreferences,
  upsertUserPreference,
} from "@canto/core/infrastructure/repositories/library-repository";
import {
  findFolderById,
  seedDefaultFolders,
} from "@canto/core/infrastructure/repositories/folder-repository";
import { findLibraryStats, listLibraryMedia, updateMedia } from "@canto/core/infrastructure/repositories/media-repository";
import { getUserLanguage } from "@canto/core/domain/services/user-service";
import { batchMediaTranslations } from "@canto/core/domain/services/translation-service";

/* -------------------------------------------------------------------------- */
/*  Library Router — media listing + user preferences                          */
/*  Folder CRUD has moved to packages/api/src/routers/folder.ts                */
/* -------------------------------------------------------------------------- */

export const libraryRouter = createTRPCRouter({
  /**
   * Paginated + filtered library listing.
   */
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const result = await listLibraryMedia(ctx.db, input, ctx.session.user.id);
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

  stats: protectedProcedure.query(({ ctx }) => findLibraryStats(ctx.db)),

  /** Seed default download folders if none exist */
  seed: adminProcedure.mutation(({ ctx }) => seedDefaultFolders(ctx.db)),

  /** Assign a folder to a media item */
  setMediaLibrary: adminProcedure
    .input(setMediaLibraryInput)
    .mutation(({ ctx, input }) =>
      updateMedia(ctx.db, input.mediaId, { libraryId: input.libraryId }),
    ),

  setContinuousDownload: adminProcedure
    .input(setContinuousDownloadInput)
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
    .input(setPreferenceInput)
    .mutation(async ({ ctx, input }) => {
      await upsertUserPreference(ctx.db, ctx.session.user.id, input.key, input.value);
      return { success: true };
    }),

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  Download Settings (global)                                               */
  /* ────────────────────────────────────────────────────────────────────────── */

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

  setDownloadSettings: adminProcedure
    .input(setDownloadSettingsInput)
    .mutation(async ({ input }) => {
      await Promise.all([
        setSetting(SETTINGS.IMPORT_METHOD, input.importMethod),
        setSetting(SETTINGS.SEED_RATIO_LIMIT, input.seedRatioLimit),
        setSetting(SETTINGS.SEED_TIME_LIMIT_HOURS, input.seedTimeLimitHours),
        setSetting(SETTINGS.SEED_CLEANUP_FILES, input.seedCleanupFiles),
      ]);
      return { success: true };
    }),
});
