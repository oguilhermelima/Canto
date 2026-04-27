import { TRPCError } from "@trpc/server";
import { and, eq, ne } from "drizzle-orm";
import { qualityProfile } from "@canto/db/schema";
import {
  createQualityProfileInput,
  deleteQualityProfileInput,
  listQualityProfilesInput,
  setDefaultQualityProfileInput,
  updateQualityProfileInput,
} from "@canto/validators";
import {
  findAllQualityProfiles,
  findQualityProfileById,
  findQualityProfilesByFlavor,
  seedDefaultQualityProfiles,
} from "@canto/core/infra/torrents/quality-profile-repository";

import { createTRPCRouter, adminProcedure } from "../../trpc";

export const qualityProfileRouter = createTRPCRouter({
  list: adminProcedure
    .input(listQualityProfilesInput.optional())
    .query(({ ctx, input }) => {
      if (input?.flavor) {
        return findQualityProfilesByFlavor(ctx.db, input.flavor);
      }
      return findAllQualityProfiles(ctx.db);
    }),

  /**
   * Seed the curated TRaSH-aligned default profiles (one per flavor,
   * marked default). Idempotent — does nothing if any profile rows
   * already exist.
   */
  seed: adminProcedure.mutation(({ ctx }) => seedDefaultQualityProfiles(ctx.db)),

  get: adminProcedure
    .input(setDefaultQualityProfileInput)
    .query(async ({ ctx, input }) => {
      const profile = await findQualityProfileById(ctx.db, input.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Quality profile not found",
        });
      }
      return profile;
    }),

  create: adminProcedure
    .input(createQualityProfileInput)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(qualityProfile)
        .values({
          name: input.name,
          flavor: input.flavor,
          allowedFormats: input.allowedFormats,
          cutoffQuality: input.cutoffQuality,
          cutoffSource: input.cutoffSource,
          minTotalScore: input.minTotalScore,
          isDefault: false,
        })
        .returning();
      if (!row) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create quality profile",
        });
      }
      return row;
    }),

  update: adminProcedure
    .input(updateQualityProfileInput)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(qualityProfile)
        .set({
          name: input.name,
          flavor: input.flavor,
          allowedFormats: input.allowedFormats,
          cutoffQuality: input.cutoffQuality,
          cutoffSource: input.cutoffSource,
          minTotalScore: input.minTotalScore,
          updatedAt: new Date(),
        })
        .where(eq(qualityProfile.id, input.id))
        .returning();
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Quality profile not found",
        });
      }
      return row;
    }),

  delete: adminProcedure
    .input(deleteQualityProfileInput)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(qualityProfile)
        .where(eq(qualityProfile.id, input.id))
        .returning({ id: qualityProfile.id });
      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Quality profile not found",
        });
      }
      return { success: true };
    }),

  /**
   * Toggle a profile as the system default for its flavor. Only one
   * profile per flavor may be the default; setting a new default
   * automatically unsets any previous one.
   */
  setDefault: adminProcedure
    .input(setDefaultQualityProfileInput)
    .mutation(async ({ ctx, input }) => {
      const target = await findQualityProfileById(ctx.db, input.id);
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Quality profile not found",
        });
      }
      await ctx.db.transaction(async (tx) => {
        // Clear any other default in the same flavor
        await tx
          .update(qualityProfile)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(qualityProfile.flavor, target.flavor),
              ne(qualityProfile.id, input.id),
            ),
          );
        await tx
          .update(qualityProfile)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(qualityProfile.id, input.id));
      });
      return { success: true };
    }),
});
