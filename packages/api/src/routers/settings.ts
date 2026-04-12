import { TRPCError } from "@trpc/server";

import {
  getAllSettings,
  getSetting,
  getSettingRaw,
  setSetting,
  setSettingRaw,
  deleteSetting,
  deleteSettingRaw,
  isSettingKey,
  type SettingKey,
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
import { dispatchRefreshAllLanguage, dispatchMediaPipeline } from "@canto/core/infrastructure/queue/bullmq-dispatcher";

// ── Extracted use-cases & services ──
import { testService } from "@canto/core/infrastructure/adapters/service-tester";
import { authenticateJellyfin } from "@canto/core/domain/use-cases/authenticate-jellyfin";
import { authenticatePlex, loginPlex, createPlexPin, checkPlexPin } from "@canto/core/domain/use-cases/authenticate-plex";
import { validateServiceUrl } from "@canto/core/domain/rules/validate-service-url";

const setupOrAdminProcedure = t.procedure.use(async ({ ctx, next }) => {
  const completed = await getSetting("onboarding.completed");
  if (completed) {
    if (!ctx.session || ctx.session.user.role !== "admin") {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Onboarding is already completed" });
    }
  }
  return next({ ctx });
});

const ALL_SERVICES = serviceEnum.options;

const SERVICE_ENABLED_KEY: Record<ServiceEnum, SettingKey> = {
  jellyfin: "jellyfin.enabled",
  plex: "plex.enabled",
  qbittorrent: "qbittorrent.enabled",
  prowlarr: "prowlarr.enabled",
  jackett: "jackett.enabled",
  tvdb: "tvdb.enabled",
  tmdb: "tmdb.enabled",
};

export const settingsRouter = createTRPCRouter({
  getAll: adminProcedure.query(() => getAllSettings()),

  get: adminProcedure
    .input(getSettingInput)
    .query(({ input }) =>
      isSettingKey(input.key)
        ? getSetting(input.key)
        : getSettingRaw(input.key),
    ),

  set: adminProcedure
    .input(setSettingInput)
    .mutation(async ({ input }) => {
      if (isSettingKey(input.key)) {
        // TODO: the generic dispatch here can't be proven at compile time
        // because `input.key` is narrowed to the full SettingKey union.
        // The registry still validates the value on write.
        await setSetting(input.key, input.value as never);
      } else {
        await setSettingRaw(input.key, input.value);
      }
      return { success: true };
    }),

  delete: adminProcedure
    .input(deleteSettingInput)
    .mutation(async ({ input }) => {
      if (isSettingKey(input.key)) {
        await deleteSetting(input.key);
      } else {
        await deleteSettingRaw(input.key);
      }
      return { success: true };
    }),

  setMany: adminProcedure
    .input(setManySettingsInput)
    .mutation(async ({ input }) => {
      for (const { key, value } of input.settings) {
        if (isSettingKey(key)) {
          // TODO: untyped generic dispatch — registry validates at write time.
          await setSetting(key, value as never);
        } else {
          await setSettingRaw(key, value);
        }
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
    const val = await getSetting("onboarding.completed");
    return val === true;
  }),

  completeOnboarding: adminProcedure.mutation(async () => {
    await setSetting("onboarding.completed", true);
    return { success: true };
  }),

  getEnabledServices: publicProcedure.query(async () => {
    const result: Record<string, boolean> = {};
    for (const s of ALL_SERVICES) {
      const val = await getSetting(SERVICE_ENABLED_KEY[s]);
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
