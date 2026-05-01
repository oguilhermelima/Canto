import {
  getAllSettings,
  getSetting,
  getSettingRaw,
  setSetting,
  setSettingRaw,
  setManySettings,
  deleteSetting,
  deleteSettingRaw,
  isSettingKey,
} from "@canto/db/settings";
import { invalidateServiceClients } from "@canto/core/infra/media-servers/service-clients";
import {
  getSettingInput,
  setSettingInput,
  deleteSettingInput,
  setManySettingsInput,
  testServiceInput,
  refreshMediaInput,
} from "@canto/validators";

import { createTRPCRouter, adminProcedure } from "../../trpc";
import { testService } from "@canto/core/platform/testing/service-tester";
import { dispatchRebuildUserRecs } from "@canto/core/platform/queue/bullmq-dispatcher";
import { jobDispatcher } from "@canto/core/platform/queue/job-dispatcher.adapter";
import { ensureMediaMany } from "@canto/core/domain/media/use-cases/ensure-media-many";
import { syncTmdbCertifications } from "@canto/core/domain/content-enrichment/use-cases/sync-tmdb-certifications";
import { getTmdbProvider } from "@canto/core/platform/http/tmdb-client";

export const settingsCoreRouter = createTRPCRouter({
  getAll: adminProcedure.query(() => getAllSettings()),

  get: adminProcedure
    .input(getSettingInput)
    .query(({ input }) =>
      isSettingKey(input.key) ? getSetting(input.key) : getSettingRaw(input.key),
    ),

  set: adminProcedure
    .input(setSettingInput)
    .mutation(async ({ input }) => {
      if (isSettingKey(input.key)) {
        // The generic dispatch can't be proven at compile time because
        // `input.key` is the full SettingKey union; the registry still
        // validates the value on write.
        await setSetting(input.key, input.value as never);
      } else {
        await setSettingRaw(input.key, input.value);
      }
      invalidateServiceClients([input.key]);
      return { success: true };
    }),

  delete: adminProcedure
    .input(deleteSettingInput)
    .mutation(async ({ input }) => {
      if (isSettingKey(input.key)) await deleteSetting(input.key);
      else await deleteSettingRaw(input.key);
      invalidateServiceClients([input.key]);
      return { success: true };
    }),

  setMany: adminProcedure
    .input(setManySettingsInput)
    .mutation(async ({ input }) => {
      // Atomic batch write so a half-applied service config (e.g.
      // enabled=true without a password) is impossible.
      await setManySettings(input.settings);
      invalidateServiceClients(input.settings.map((s) => s.key));
      return { success: true };
    }),

  testService: adminProcedure
    .input(testServiceInput)
    .mutation(({ input }) => testService(input.service, input.values)),

  /**
   * Unified refresh endpoint. Replaces the old `refreshLanguage` (blanket)
   * and `refreshMissingTranslations` (targeted translations only). Enqueues
   * `ensureMedia` jobs for whatever is missing, or with `force: true`, for
   * every matched media.
   */
  refreshMedia: adminProcedure
    .input(refreshMediaInput)
    .mutation(({ ctx, input }) => {
      const filter = {
        mediaIds: input.mediaId ? [input.mediaId] : undefined,
      };
      const spec = {
        languages: input.languages,
        aspects: input.aspects,
        force: input.force,
      };

      // Bulk runs (no specific mediaId) iterate the entire media table and
      // run gap detection per-row, which can take minutes on large libraries.
      // Fire-and-forget so the HTTP response returns immediately. Errors are
      // logged; per-media job failures are handled by the worker independently.
      // Also refreshes the TMDB certification catalog once per sweep so the
      // filter sidebar's region options stay in sync without a separate UI.
      if (!input.mediaId && !input.dryRun) {
        void (async () => {
          try {
            const tmdb = await getTmdbProvider();
            await syncTmdbCertifications(ctx.db, tmdb);
          } catch (err) {
            console.error("[settings.refreshMedia] cert sync failed:", err);
          }
          await ensureMediaMany(ctx.db, { dispatcher: jobDispatcher }, filter, spec);
        })().catch((err) => {
          console.error("[settings.refreshMedia] bulk dispatch failed:", err);
        });
        return {
          dispatched: 0,
          skipped: 0,
          byAspect: {
            metadata: 0,
            structure: 0,
            translations: 0,
            logos: 0,
            extras: 0,
            contentRatings: 0,
          },
          byLanguage: {},
          started: true as const,
        };
      }

      return ensureMediaMany(ctx.db, { dispatcher: jobDispatcher }, filter, spec, { dryRun: input.dryRun });
    }),

  rebuildUserRecommendations: adminProcedure.mutation(async ({ ctx }) => {
    await dispatchRebuildUserRecs(ctx.session.user.id);
    return { success: true };
  }),
});
