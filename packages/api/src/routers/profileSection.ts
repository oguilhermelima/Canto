import { saveProfileSectionsInput } from "@canto/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  findProfileSections,
  replaceProfileSections,
  deleteProfileSections,
  seedProfileSectionsForUser,
} from "@canto/core/infrastructure/repositories/profile-section-repository";
import { DEFAULT_PROFILE_SECTIONS } from "@canto/db/profile-section-defaults";

export const profileSectionRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    let sections = await findProfileSections(ctx.db, ctx.session.user.id);
    // Auto-seed for existing users who don't have profile sections yet
    if (sections.length === 0) {
      await seedProfileSectionsForUser(ctx.db, ctx.session.user.id, DEFAULT_PROFILE_SECTIONS);
      sections = await findProfileSections(ctx.db, ctx.session.user.id);
    }
    return { sections };
  }),

  save: protectedProcedure
    .input(saveProfileSectionsInput)
    .mutation(async ({ ctx, input }) => {
      await replaceProfileSections(ctx.db, ctx.session.user.id, input.sections);
      return { success: true };
    }),

  resetToDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    await deleteProfileSections(ctx.db, ctx.session.user.id);
    await seedProfileSectionsForUser(ctx.db, ctx.session.user.id, DEFAULT_PROFILE_SECTIONS);
    return { success: true };
  }),
});
