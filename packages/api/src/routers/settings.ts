import { TRPCError } from "@trpc/server";

import {
  getAllSettings,
  getSetting,
  getSettings,
  getSettingRaw,
  setSetting,
  setSettingRaw,
  setManySettings,
  deleteSetting,
  deleteSettingRaw,
  isSettingKey,
  type SettingKey,
} from "@canto/db/settings";
import { invalidateServiceClients } from "@canto/core/infrastructure/adapters/service-clients";
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
      // Any cached service client built from this key must be rebuilt with
      // the new credentials on the next use.
      invalidateServiceClients([input.key]);
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
      invalidateServiceClients([input.key]);
      return { success: true };
    }),

  setMany: adminProcedure
    .input(setManySettingsInput)
    .mutation(async ({ input }) => {
      // Atomic batch write: either every setting lands or none do, so a
      // half-applied service config (e.g. enabled=true without a password)
      // is impossible.
      await setManySettings(input.settings);
      invalidateServiceClients(input.settings.map((s) => s.key));
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
      const key = SERVICE_ENABLED_KEY[input.service];
      await setSetting(key, input.enabled);
      invalidateServiceClients([key]);
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
    // The middleware lets anything past /onboarding as long as this flag is
    // true, so flipping it unguarded meant an admin who spam-clicked through
    // the wizard could land in a broken app with zero metadata. TMDB is the
    // one hard requirement (every provider path depends on it); everything
    // else is optional and can be added later from Settings.
    const tmdbKey = await getSetting("tmdb.apiKey");
    if (!tmdbKey) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "TMDB must be configured before completing onboarding",
      });
    }
    await setSetting("onboarding.completed", true);
    return { success: true };
  }),

  getEnabledServices: publicProcedure.query(async () => {
    const keys = ALL_SERVICES.map((s) => SERVICE_ENABLED_KEY[s]);
    const values = await getSettings(keys);
    const result: Record<string, boolean> = {};
    for (const s of ALL_SERVICES) {
      result[s] = values[SERVICE_ENABLED_KEY[s]] === true;
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
