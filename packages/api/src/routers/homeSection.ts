import { saveHomeSectionsInput } from "@canto/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  findHomeSections,
  replaceHomeSections,
  deleteHomeSections,
  seedHomeSectionsForUser,
} from "@canto/core/infrastructure/repositories/home-section-repository";
import { DEFAULT_HOME_SECTIONS } from "@canto/db/home-section-defaults";

export const homeSectionRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const sections = await findHomeSections(ctx.db, ctx.session.user.id);
    return { sections };
  }),

  save: protectedProcedure
    .input(saveHomeSectionsInput)
    .mutation(async ({ ctx, input }) => {
      await replaceHomeSections(ctx.db, ctx.session.user.id, input.sections);
      return { success: true };
    }),

  resetToDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteHomeSections(ctx.db, ctx.session.user.id);
    await seedHomeSectionsForUser(ctx.db, ctx.session.user.id, DEFAULT_HOME_SECTIONS);
    return { success: true };
  }),
});
