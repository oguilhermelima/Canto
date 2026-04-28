import { downloadPreferencesInput } from "@canto/validators";
import {
  findDownloadPreferences,
  upsertDownloadPreference,
} from "@canto/core/infra/user/preferences-repository";

import { createTRPCRouter, protectedProcedure } from "../../trpc";

export const preferencesDownloadsRouter = createTRPCRouter({
  get: protectedProcedure.query(({ ctx }) =>
    findDownloadPreferences(ctx.db, ctx.session.user.id),
  ),

  set: protectedProcedure
    .input(downloadPreferencesInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Each list is its own user_preference row; setting them in
      // parallel keeps the procedure single-round-trip-fast.
      await Promise.all([
        upsertDownloadPreference(
          ctx.db,
          userId,
          "preferredLanguages",
          input.preferredLanguages,
        ),
        upsertDownloadPreference(
          ctx.db,
          userId,
          "preferredStreamingServices",
          input.preferredStreamingServices,
        ),
      ]);
      return { success: true };
    }),
});
