import { downloadPreferencesInput } from "@canto/validators";
import { parseUserId } from "@canto/core/domain/user/types/user";
import { makeUserRepository } from "@canto/core/infra/user/user-repository.adapter";

import { createTRPCRouter, protectedProcedure } from "../../trpc";

export const preferencesDownloadsRouter = createTRPCRouter({
  get: protectedProcedure.query(({ ctx }) => {
    const userRepo = makeUserRepository(ctx.db);
    return userRepo.findDownloadPreferences(parseUserId(ctx.session.user.id));
  }),

  set: protectedProcedure
    .input(downloadPreferencesInput)
    .mutation(async ({ ctx, input }) => {
      const userRepo = makeUserRepository(ctx.db);
      const userId = parseUserId(ctx.session.user.id);
      // Each list is its own user_preference row; setting them in
      // parallel keeps the procedure single-round-trip-fast.
      await Promise.all([
        userRepo.upsertDownloadPreference(
          userId,
          "preferredLanguages",
          input.preferredLanguages,
        ),
        userRepo.upsertDownloadPreference(
          userId,
          "preferredStreamingServices",
          input.preferredStreamingServices,
        ),
      ]);
      return { success: true };
    }),
});
