import { saveProfileSectionsInput } from "@canto/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  findProfileSections,
  replaceProfileSections,
  deleteProfileSections,
  seedProfileSectionsForUser,
} from "@canto/core/infrastructure/repositories/profile-section-repository";
import {
  DEFAULT_PROFILE_SECTIONS,
  CANONICAL_SECTION_KEYS,
} from "@canto/db/profile-section-defaults";

export const profileSectionRouter = createTRPCRouter({
  /**
   * Returns the user's sections, auto-seeding on first load and auto-migrating
   * whenever the stored keys diverge from the canonical set (post-redesign).
   * Migration drops toggle state — acceptable tradeoff to stay schema-canonical.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    let sections = await findProfileSections(ctx.db, ctx.session.user.id);

    const storedKeys = new Set(sections.map((s) => s.sectionKey));
    const hasObsolete = sections.some((s) => !CANONICAL_SECTION_KEYS.has(s.sectionKey));
    const missingCanonical = DEFAULT_PROFILE_SECTIONS.some(
      (d) => !storedKeys.has(d.sectionKey),
    );

    if (sections.length === 0 || hasObsolete || missingCanonical) {
      await deleteProfileSections(ctx.db, ctx.session.user.id);
      await seedProfileSectionsForUser(
        ctx.db,
        ctx.session.user.id,
        DEFAULT_PROFILE_SECTIONS,
      );
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
    await seedProfileSectionsForUser(
      ctx.db,
      ctx.session.user.id,
      DEFAULT_PROFILE_SECTIONS,
    );
    return { success: true };
  }),
});
