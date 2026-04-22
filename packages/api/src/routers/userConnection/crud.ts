import { eq, and } from "drizzle-orm";
import { userConnection } from "@canto/db/schema";
import { deleteUserConnectionInput } from "@canto/validators";
import {
  dispatchUserReverseSync,
  dispatchUserTraktSync,
} from "@canto/core/platform/queue/bullmq-dispatcher";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

export const crudRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.userConnection.findMany({
      where: eq(userConnection.userId, ctx.session.user.id),
    });
  }),

  remove: protectedProcedure
    .input(deleteUserConnectionInput)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(userConnection)
        .where(
          and(
            eq(userConnection.id, input.id),
            eq(userConnection.userId, ctx.session.user.id),
          ),
        );
      return { success: true };
    }),

  /**
   * On-demand reverse sync for the current user. Called by the web app on
   * mount / tab-focus so users see fresh playback state without waiting for
   * the 5-min scheduled sweep. Dedupes in the dispatcher via jobId.
   */
  syncNow: protectedProcedure.mutation(async ({ ctx }) => {
    const [reverseDispatched, traktDispatched] = await Promise.all([
      dispatchUserReverseSync(ctx.session.user.id),
      dispatchUserTraktSync(ctx.session.user.id),
    ]);
    return { dispatched: reverseDispatched || traktDispatched };
  }),
});
