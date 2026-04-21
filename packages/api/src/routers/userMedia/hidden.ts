import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  getHiddenMediaInput,
  hideMediaInput,
  unhideMediaInput,
} from "@canto/validators";
import {
  findHiddenIds,
  findHiddenMediaPaginated,
  hideMedia,
  unhideMedia,
} from "@canto/core/infrastructure/repositories";

export const hiddenRouter = createTRPCRouter({
  hideMedia: protectedProcedure
    .input(hideMediaInput)
    .mutation(async ({ ctx, input }) => {
      await hideMedia(ctx.db, { ...input, userId: ctx.session.user.id });
      return { success: true };
    }),

  unhideMedia: protectedProcedure
    .input(unhideMediaInput)
    .mutation(async ({ ctx, input }) => {
      await unhideMedia(ctx.db, { ...input, userId: ctx.session.user.id });
      return { success: true };
    }),

  getHiddenMedia: protectedProcedure
    .input(getHiddenMediaInput)
    .query(async ({ ctx, input }) => {
      const offset = input.cursor ?? 0;
      const { items, total } = await findHiddenMediaPaginated(
        ctx.db,
        ctx.session.user.id,
        { limit: input.limit, offset },
      );
      const nextCursor =
        offset + input.limit < total ? offset + input.limit : undefined;
      return { items, total, nextCursor };
    }),

  getHiddenIds: protectedProcedure.query(({ ctx }) =>
    findHiddenIds(ctx.db, ctx.session.user.id),
  ),
});
