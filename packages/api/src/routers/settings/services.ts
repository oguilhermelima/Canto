import { TRPCError } from "@trpc/server";
import { getSetting, getSettings, setSetting } from "@canto/db/settings";
import { invalidateServiceClients } from "@canto/core/infrastructure/adapters/service-clients";
import {
  serviceEnum,
  toggleServiceInput,
  toggleTvdbDefaultInput,
  authenticateJellyfinInput,
  authenticatePlexInput,
  authenticateTraktInput,
  loginPlexInput,
  checkPlexPinInput,
} from "@canto/validators";

import { createTRPCRouter, adminProcedure, protectedProcedure, publicProcedure, t } from "../../trpc";
import { SERVICE_ENABLED_KEY } from "@canto/core/domain/rules/service-keys";
import { toggleTvdbDefault } from "@canto/core/domain/use-cases/media/toggle-tvdb-default";
import {
  authenticateJellyfin,
  authenticatePlex,
  authenticateTrakt,
  loginPlex,
  createPlexPin,
  checkPlexPin,
} from "@canto/core/domain/use-cases/media-servers/authenticate";

const ALL_SERVICES = serviceEnum.options;

/**
 * Admin-only once onboarding is complete, open to anyone during setup.
 * Keeps the onboarding wizard functional for the bootstrap admin without
 * giving anonymous callers a way to re-auth services post-setup.
 */
const setupOrAdminProcedure = t.procedure.use(async ({ ctx, next }) => {
  const completed = await getSetting("onboarding.completed");
  if (completed && (!ctx.session || ctx.session.user.role !== "admin")) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Onboarding is already completed",
    });
  }
  return next({ ctx });
});

export const settingsServicesRouter = createTRPCRouter({
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
    .mutation(({ ctx, input }) => toggleTvdbDefault(ctx.db, input.enabled)),

  isOnboardingCompleted: publicProcedure.query(async () => {
    const val = await getSetting("onboarding.completed");
    return val === true;
  }),

  completeOnboarding: adminProcedure.mutation(async () => {
    // The /onboarding middleware lets traffic through while this flag is
    // false, so we gate the flip on TMDB actually being configured. An
    // admin who clicked through without setting TMDB would otherwise land
    // in an app with zero metadata providers; everything else is optional
    // and can be added later from Settings.
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

  /**
   * Readiness signal for the user-onboarding flow. Lets the UI pick the
   * provider steps to show without needing admin-only settings access.
   * Trakt has no `trakt.enabled` flag, so readiness = both OAuth creds set.
   */
  getMediaProvidersReady: protectedProcedure.query(async () => {
    const values = await getSettings([
      "jellyfin.enabled",
      "plex.enabled",
      "trakt.clientId",
      "trakt.clientSecret",
    ]);
    return {
      jellyfin: values["jellyfin.enabled"] === true,
      plex: values["plex.enabled"] === true,
      trakt:
        typeof values["trakt.clientId"] === "string"
        && values["trakt.clientId"].length > 0
        && typeof values["trakt.clientSecret"] === "string"
        && values["trakt.clientSecret"].length > 0,
    };
  }),

  authenticateJellyfin: setupOrAdminProcedure
    .input(authenticateJellyfinInput)
    .mutation(({ input }) => authenticateJellyfin(input)),

  authenticatePlex: setupOrAdminProcedure
    .input(authenticatePlexInput)
    .mutation(({ input }) => authenticatePlex(input)),

  authenticateTrakt: setupOrAdminProcedure
    .input(authenticateTraktInput)
    .mutation(({ input }) => authenticateTrakt(input)),

  loginPlex: setupOrAdminProcedure
    .input(loginPlexInput)
    .mutation(({ input }) => loginPlex(input)),

  plexPinCreate: setupOrAdminProcedure.mutation(() => createPlexPin()),

  plexPinCheck: setupOrAdminProcedure
    .input(checkPlexPinInput)
    .query(({ input }) => checkPlexPin(input)),
});
