import { saveHomeSectionsInput } from "@canto/validators";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import {
  findHomeSections,
  replaceHomeSections,
  deleteHomeSections,
  seedHomeSectionsForUser,
} from "@canto/core/infra/profile/home-section-aggregate-repository";
import {
  DEFAULT_HOME_SECTIONS,
  CANONICAL_HOME_SECTIONS,
} from "@canto/db/home-section-defaults";

export const homeSectionRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    let sections = await findHomeSections(ctx.db, ctx.session.user.id);

    // Reconcile: ensure every canonical section exists for this user.
    const presentKeys = new Set(sections.map((s) => s.sourceKey));
    const missing = CANONICAL_HOME_SECTIONS.filter((c) => !presentKeys.has(c.sourceKey));
    if (missing.length > 0) {
      const startPos = sections.length > 0
        ? Math.max(...sections.map((s) => s.position)) + 1
        : 0;
      await seedHomeSectionsForUser(
        ctx.db,
        ctx.session.user.id,
        missing.map((c, i) => ({ ...c, position: startPos + i })),
      );
      sections = await findHomeSections(ctx.db, ctx.session.user.id);
    }

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
