import { TRPCError } from "@trpc/server";
import { setUserLanguageInput } from "@canto/validators";
import { auth } from "@canto/auth";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import {
  getUserLanguage,
  invalidateActiveUserLanguages,
} from "@canto/core/domain/shared/services/user-service";
import {
  findEnabledSupportedLanguages,
  findSupportedLanguage,
  updateUserLanguage,
} from "@canto/core/infra/shared/language-repository";

export const settingsLanguagesRouter = createTRPCRouter({
  getUserLanguage: protectedProcedure.query(({ ctx }) =>
    getUserLanguage(ctx.db, ctx.session.user.id),
  ),

  setUserLanguage: protectedProcedure
    .input(setUserLanguageInput)
    .mutation(async ({ ctx, input }) => {
      const lang = await findSupportedLanguage(ctx.db, input.language);
      if (!lang) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Language "${input.language}" is not supported`,
        });
      }
      // Per-media translations are filled lazily on the media.resolve hot
      // path (detectGaps + dispatchEnsureMedia). Admins can force a bulk
      // backfill via `settings.refreshMedia`.
      await updateUserLanguage(ctx.db, ctx.session.user.id, input.language);
      invalidateActiveUserLanguages();

      // Force the better-auth cookieCache to refresh with the new language.
      // Without this, every subsequent tRPC request (incl. spotlight, recs,
      // library) reads a stale "en-US" off the signed cookie until the
      // session ticks past `updateAge` (1 day) or the user signs out/in.
      //
      // `disableCookieCache: true` skips the in-cookie snapshot and fetches
      // user data fresh from Postgres, then re-signs the cookie. We hand
      // `asResponse: true` so we can pull the Set-Cookie header off the
      // returned Response and propagate it onto our tRPC reply.
      try {
        const refreshed = await auth.api.getSession({
          headers: ctx.req.headers,
          query: { disableCookieCache: true },
          asResponse: true,
        });
        const setCookies = refreshed.headers.getSetCookie();
        for (const cookie of setCookies) {
          ctx.resHeaders.append("set-cookie", cookie);
        }
      } catch (err) {
        // Cookie refresh is a UX nicety, not a correctness gate — the DB
        // already has the new language and `updateAge` will heal eventually.
        // Surface in logs so we notice if the refresh path regresses.
        console.warn("[setUserLanguage] cookie refresh failed", err);
      }

      return { success: true };
    }),

  getSupportedLanguages: publicProcedure.query(({ ctx }) =>
    findEnabledSupportedLanguages(ctx.db),
  ),
});
