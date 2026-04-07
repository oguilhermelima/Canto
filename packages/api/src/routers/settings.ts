import { TRPCError } from "@trpc/server";

import {
  getAllSettings,
  getSetting,
  setSetting,
  deleteSetting,
} from "@canto/db/settings";
import {
  serviceEnum,
  getSettingInput,
  setSettingInput,
  deleteSettingInput,
  setManySettingsInput,
  testServiceInput,
  setUserLanguageInput,
  toggleServiceInput,
  toggleTvdbDefaultInput,
  authenticateJellyfinInput,
  authenticatePlexInput,
  loginPlexInput,
  checkPlexPinInput,
} from "@canto/validators";
import type { ServiceEnum } from "@canto/validators";

import { and, eq } from "drizzle-orm";
import { media, user, supportedLanguage } from "@canto/db/schema";
import { createTRPCRouter, adminProcedure, protectedProcedure, publicProcedure, t } from "../trpc";
import { SETTINGS } from "../lib/settings-keys";
import { dispatchRefreshAllLanguage, dispatchMediaPipeline } from "../infrastructure/queue/bullmq-dispatcher";

// ── Extracted use-cases & services ──
import { testService } from "../infrastructure/adapters/service-tester";
import { authenticateJellyfin } from "../domain/use-cases/authenticate-jellyfin";
import { authenticatePlex, loginPlex, createPlexPin, checkPlexPin } from "../domain/use-cases/authenticate-plex";
import { validateServiceUrl } from "../domain/rules/validate-service-url";

const setupOrAdminProcedure = t.procedure.use(async ({ ctx, next }) => {
  const completed = await getSetting<boolean>("onboarding.completed");
  if (completed) {
    if (!ctx.session || ctx.session.user.role !== "admin") {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Onboarding is already completed" });
    }
  }
  return next({ ctx });
});

const ALL_SERVICES = serviceEnum.options;

const SERVICE_ENABLED_KEY: Record<ServiceEnum, string> = {
  jellyfin: SETTINGS.JELLYFIN_ENABLED,
  plex: SETTINGS.PLEX_ENABLED,
  qbittorrent: SETTINGS.QBITTORRENT_ENABLED,
  prowlarr: SETTINGS.PROWLARR_ENABLED,
  jackett: SETTINGS.JACKETT_ENABLED,
  tvdb: SETTINGS.TVDB_ENABLED,
  tmdb: SETTINGS.TMDB_API_KEY,
};

export const settingsRouter = createTRPCRouter({
  getAll: adminProcedure.query(() => getAllSettings()),

  get: adminProcedure
    .input(getSettingInput)
    .query(({ input }) => getSetting(input.key)),

  set: adminProcedure
    .input(setSettingInput)
    .mutation(async ({ input }) => {
      await setSetting(input.key, input.value);
      return { success: true };
    }),

  delete: adminProcedure
    .input(deleteSettingInput)
    .mutation(async ({ input }) => {
      await deleteSetting(input.key);
      return { success: true };
    }),

  setMany: adminProcedure
    .input(setManySettingsInput)
    .mutation(async ({ input }) => {
      for (const { key, value } of input.settings) {
        await setSetting(key, value);
      }
      return { success: true };
    }),

  testService: adminProcedure
    .input(testServiceInput)
    .mutation(({ input }) => testService(input.service, input.values)),

  getUserLanguage: protectedProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.query.user.findFirst({
      where: eq(user.id, ctx.session.user.id),
      columns: { language: true },
    });
    return row?.language ?? "en-US";
  }),

  setUserLanguage: protectedProcedure
    .input(setUserLanguageInput)
    .mutation(async ({ ctx, input }) => {
      const lang = await ctx.db.query.supportedLanguage.findFirst({
        where: eq(supportedLanguage.code, input.language),
      });
      if (!lang) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Language "${input.language}" is not supported` });
      }
      await ctx.db
        .update(user)
        .set({ language: input.language })
        .where(eq(user.id, ctx.session.user.id));
      return { success: true };
    }),

  getSupportedLanguages: publicProcedure.query(({ ctx }) =>
    ctx.db.query.supportedLanguage.findMany({
      where: eq(supportedLanguage.enabled, true),
      orderBy: (t, { asc }) => [asc(t.name)],
    }),
  ),

  refreshLanguage: adminProcedure.mutation(async () => {
    await dispatchRefreshAllLanguage();
    return { success: true };
  }),

  toggleService: adminProcedure
    .input(toggleServiceInput)
    .mutation(async ({ input }) => {
      await setSetting(SERVICE_ENABLED_KEY[input.service], input.enabled);
      return { success: true };
    }),

  toggleTvdbDefault: adminProcedure
    .input(toggleTvdbDefaultInput)
    .mutation(async ({ ctx, input }) => {
      await setSetting("tvdb.defaultShows", input.enabled);
      const shows = await ctx.db
        .select({ id: media.id })
        .from(media)
        .where(and(eq(media.inLibrary, true), eq(media.type, "show")));
      for (const show of shows) {
        await dispatchMediaPipeline({ mediaId: show.id, useTVDBSeasons: input.enabled });
      }
      return { success: true, reprocessing: shows.length };
    }),

  isOnboardingCompleted: publicProcedure.query(async () => {
    const val = await getSetting<boolean>(SETTINGS.ONBOARDING_COMPLETED);
    return val === true;
  }),

  completeOnboarding: adminProcedure.mutation(async () => {
    await setSetting(SETTINGS.ONBOARDING_COMPLETED, true);
    return { success: true };
  }),

  getEnabledServices: publicProcedure.query(async () => {
    const result: Record<string, boolean> = {};
    for (const s of ALL_SERVICES) {
      const val = await getSetting<boolean>(SERVICE_ENABLED_KEY[s]);
      result[s] = val === true;
    }
    return result;
  }),

  authenticateJellyfin: setupOrAdminProcedure
    .input(authenticateJellyfinInput)
    .mutation(({ input }) => authenticateJellyfin(input)),

  authenticatePlex: setupOrAdminProcedure
    .input(authenticatePlexInput)
    .mutation(({ input }) => authenticatePlex(input)),

  loginPlex: setupOrAdminProcedure
    .input(loginPlexInput)
    .mutation(({ input }) => loginPlex(input)),

  plexPinCreate: setupOrAdminProcedure.mutation(() => createPlexPin()),

  plexPinCheck: setupOrAdminProcedure
    .input(checkPlexPinInput)
    .query(({ input }) => checkPlexPin(input)),
});
