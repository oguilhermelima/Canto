import { TRPCError } from "@trpc/server";
import { setUserLanguageInput } from "@canto/validators";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../../trpc";
import {
  getUserLanguage,
  invalidateActiveUserLanguages,
} from "@canto/core/domain/services/user-service";
import {
  findEnabledSupportedLanguages,
  findSupportedLanguage,
  updateUserLanguage,
} from "@canto/core/infrastructure/repositories/shared/language-repository";

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
      return { success: true };
    }),

  getSupportedLanguages: publicProcedure.query(({ ctx }) =>
    findEnabledSupportedLanguages(ctx.db),
  ),
});
