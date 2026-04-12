import { z } from "zod";
import {
  listInput,
  setMediaLibraryInput,
  setContinuousDownloadInput,
  setPreferenceInput,
  setDownloadSettingsInput,
} from "@canto/validators";
import { deleteSetting, getSetting, getSettings, setSetting } from "@canto/db/settings";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
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
    const {
      "download.importMethod": importMethod,
      "download.seedRatioLimit": seedRatio,
      "download.seedTimeLimitHours": seedTime,
      "download.seedCleanupFiles": seedCleanup,
    } = await getSettings([
      "download.importMethod",
      "download.seedRatioLimit",
      "download.seedTimeLimitHours",
      "download.seedCleanupFiles",
    ]);
    return {
      importMethod: importMethod ?? "local",
      seedRatioLimit: seedRatio ?? null,
      seedTimeLimitHours: seedTime ?? null,
      seedCleanupFiles: seedCleanup ?? false,
    };
  }),

  setDownloadSettings: adminProcedure
    .input(setDownloadSettingsInput)
    .mutation(async ({ input }) => {
      // null means "no limit" — reset to the registry default instead of
      // writing an invalid number through setSetting.
      await Promise.all([
        setSetting("download.importMethod", input.importMethod),
        input.seedRatioLimit === null
          ? deleteSetting("download.seedRatioLimit")
          : setSetting("download.seedRatioLimit", input.seedRatioLimit),
        input.seedTimeLimitHours === null
          ? deleteSetting("download.seedTimeLimitHours")
          : setSetting("download.seedTimeLimitHours", input.seedTimeLimitHours),
        setSetting("download.seedCleanupFiles", input.seedCleanupFiles),
      ]);
      return { success: true };
    }),

  /* ────────────────────────────────────────────────────────────────────────── */
  /*  Post-import settings (global)                                            */
  /* ────────────────────────────────────────────────────────────────────────── */

  getAutoMergeVersions: adminProcedure.query(async () => {
    const value = await getSetting("autoMergeVersions");
    return value ?? true;
  }),

  setAutoMergeVersions: adminProcedure
    .input(z.boolean())
    .mutation(async ({ input }) => {
      await setSetting("autoMergeVersions", input);
      return { success: true };
    }),
});
