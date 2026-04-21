import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { dispatchRebuildUserRecs } from "@canto/core/infrastructure/queue/bullmq-dispatcher";

export const mediaRebuildRouter = createTRPCRouter({
  rebuildMyRecommendations: protectedProcedure
    .mutation(async ({ ctx }) => {
      await dispatchRebuildUserRecs(ctx.session.user.id);
      return { success: true };
    }),
});
