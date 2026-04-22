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
import { ensureMediaMany } from "@canto/core/domain/media/use-cases/ensure-media-many";

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
    .mutation(({ ctx, input }) =>
      ensureMediaMany(
        ctx.db,
        { mediaIds: input.mediaId ? [input.mediaId] : undefined },
        { languages: input.languages, aspects: input.aspects, force: input.force },
        { dryRun: input.dryRun },
      ),
    ),

  rebuildUserRecommendations: adminProcedure.mutation(async ({ ctx }) => {
    await dispatchRebuildUserRecs(ctx.session.user.id);
    return { success: true };
  }),
});
