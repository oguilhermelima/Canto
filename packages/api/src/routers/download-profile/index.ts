import { TRPCError } from "@trpc/server";
import { and, eq, ne } from "drizzle-orm";
import { downloadProfile } from "@canto/db/schema";
import {
  createDownloadProfileInput,
  deleteDownloadProfileInput,
  listDownloadProfilesInput,
  setDefaultDownloadProfileInput,
  updateDownloadProfileInput,
} from "@canto/validators";
import {
  findAllDownloadProfiles,
  findDownloadProfileById,
  findDownloadProfilesByFlavor,
  seedDefaultDownloadProfiles,
} from "@canto/core/infra/torrents/download-profile-repository";

import { createTRPCRouter, adminProcedure } from "../../trpc";

export const downloadProfileRouter = createTRPCRouter({
  list: adminProcedure
    .input(listDownloadProfilesInput.optional())
    .query(({ ctx, input }) => {
      if (input?.flavor) {
        return findDownloadProfilesByFlavor(ctx.db, input.flavor);
      }
      return findAllDownloadProfiles(ctx.db);
    }),

  /**
   * Seed the curated TRaSH-aligned default profiles (one per flavor,
   * marked default). Idempotent — does nothing if any profile rows
   * already exist.
   */
  seed: adminProcedure.mutation(({ ctx }) => seedDefaultDownloadProfiles(ctx.db)),

  get: adminProcedure
    .input(setDefaultDownloadProfileInput)
    .query(async ({ ctx, input }) => {
      const profile = await findDownloadProfileById(ctx.db, input.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Download profile not found",
        });
      }
      return profile;
    }),

  create: adminProcedure
    .input(createDownloadProfileInput)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(downloadProfile)
        .values({
          name: input.name,
          flavor: input.flavor,
          allowedFormats: input.allowedFormats,
          cutoffQuality: input.cutoffQuality,
          cutoffSource: input.cutoffSource,
          minTotalScore: input.minTotalScore,
          languages: input.languages,
          languageStrict: input.languageStrict,
          isDefault: false,
        })
        .returning();
      if (!row) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create download profile",
        });
      }
      return row;
    }),

  update: adminProcedure
    .input(updateDownloadProfileInput)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(downloadProfile)
        .set({
          name: input.name,
          flavor: input.flavor,
          allowedFormats: input.allowedFormats,
          cutoffQuality: input.cutoffQuality,
          cutoffSource: input.cutoffSource,
          minTotalScore: input.minTotalScore,
          languages: input.languages,
          languageStrict: input.languageStrict,
          updatedAt: new Date(),
        })
        .where(eq(downloadProfile.id, input.id))
        .returning();
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Download profile not found",
        });
      }
      return row;
    }),

  delete: adminProcedure
    .input(deleteDownloadProfileInput)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(downloadProfile)
        .where(eq(downloadProfile.id, input.id))
        .returning({ id: downloadProfile.id });
      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Download profile not found",
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
    .input(setDefaultDownloadProfileInput)
    .mutation(async ({ ctx, input }) => {
      const target = await findDownloadProfileById(ctx.db, input.id);
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Download profile not found",
        });
      }
      await ctx.db.transaction(async (tx) => {
        // Clear any other default in the same flavor
        await tx
          .update(downloadProfile)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(downloadProfile.flavor, target.flavor),
              ne(downloadProfile.id, input.id),
            ),
          );
        await tx
          .update(downloadProfile)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(downloadProfile.id, input.id));
      });
      return { success: true };
    }),
});
