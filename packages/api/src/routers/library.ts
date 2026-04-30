import {
  listInput,
  setMediaLibraryInput,
  setContinuousDownloadInput,
  setPreferenceInput,
  setDownloadSettingsInput,
  setAutoMergeVersionsInput,
} from "@canto/validators";
import { deleteSetting, getSetting, getSettings, setSetting } from "@canto/db/settings";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import {
  findUserPreferences,
  upsertUserPreference,
} from "@canto/core/infra/file-organization/library-repository";
import {
  findFolderById,
  seedDefaultFolders,
} from "@canto/core/infra/file-organization/folder-repository";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";

/* -------------------------------------------------------------------------- */
/*  Library Router — media listing + user preferences                          */
/*  Folder CRUD has moved to packages/api/src/routers/folder.ts                */
/* -------------------------------------------------------------------------- */

export const libraryRouter = createTRPCRouter({
  /**
   * Paginated + filtered library listing.
   *
   * Translation overlay is applied inside `listLibraryMedia` via a LEFT JOIN
   * on `media_translation`, so this route is a thin pass-through. The previous
   * implementation issued a separate `batchMediaTranslations` round trip per
   * page; the new shape collapses into a single query (and skips it entirely
   * for English-original media via COALESCE).
   */
  list: protectedProcedure.input(listInput).query(({ ctx, input }) =>
    makeMediaRepository(ctx.db).listLibraryMedia(
      input,
      ctx.session.user.language,
      ctx.session.user.id,
    ),
  ),

  stats: protectedProcedure.query(({ ctx }) => makeMediaRepository(ctx.db).findLibraryStats()),

  /** Seed default download folders if none exist */
  seed: adminProcedure.mutation(({ ctx }) => seedDefaultFolders(ctx.db)),

  /** Assign a folder to a media item */
  setMediaLibrary: adminProcedure
    .input(setMediaLibraryInput)
    .mutation(({ ctx, input }) =>
      makeMediaRepository(ctx.db).updateMedia(input.mediaId, { libraryId: input.libraryId }),
    ),

  setContinuousDownload: adminProcedure
    .input(setContinuousDownloadInput)
    .mutation(({ ctx, input }) =>
      makeMediaRepository(ctx.db).updateMedia(input.mediaId, { continuousDownload: input.enabled }),
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
      seedCleanupFiles: seedCleanup ?? true,
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
    .input(setAutoMergeVersionsInput)
    .mutation(async ({ input }) => {
      await setSetting("autoMergeVersions", input);
      return { success: true };
    }),
});
