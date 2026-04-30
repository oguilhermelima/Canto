import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  getHiddenMediaInput,
  hideMediaInput,
  unhideMediaInput,
} from "@canto/validators";
import { makeUserMediaRepository } from "@canto/core/infra/user-media/user-media-repository.adapter";

export const hiddenRouter = createTRPCRouter({
  hideMedia: protectedProcedure
    .input(hideMediaInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      await repo.hide({ ...input, userId: ctx.session.user.id });
      return { success: true };
    }),

  unhideMedia: protectedProcedure
    .input(unhideMediaInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      await repo.unhide({ ...input, userId: ctx.session.user.id });
      return { success: true };
    }),

  getHiddenMedia: protectedProcedure
    .input(getHiddenMediaInput)
    .query(async ({ ctx, input }) => {
      const repo = makeUserMediaRepository(ctx.db);
      const offset = input.cursor ?? 0;
      const { items, total } = await repo.findHiddenPaginated(
        ctx.session.user.id,
        { limit: input.limit, offset },
      );
      const nextCursor =
        offset + input.limit < total ? offset + input.limit : undefined;
      return { items, total, nextCursor };
    }),

  getHiddenIds: protectedProcedure.query(({ ctx }) => {
    const repo = makeUserMediaRepository(ctx.db);
    return repo.findHiddenIds(ctx.session.user.id);
  }),
});
