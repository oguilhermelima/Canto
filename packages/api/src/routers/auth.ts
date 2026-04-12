import { asc, eq } from "drizzle-orm";
import { user } from "@canto/db/schema";
import { setUserPreferencesInput } from "@canto/validators";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";

export const authRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => {
    return ctx.session.user;
  }),

  /** List all users — admin only */
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(asc(user.createdAt));
    return rows;
  }),

  /** Get user preferences (watch region, direct search, profile visibility) */
  getUserPreferences: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        watchRegion: user.watchRegion,
        directSearchEnabled: user.directSearchEnabled,
        isPublic: user.isPublic,
      })
      .from(user)
      .where(eq(user.id, ctx.session.user.id));
    return {
      watchRegion: row?.watchRegion ?? null,
      directSearchEnabled: row?.directSearchEnabled ?? true,
      isPublic: row?.isPublic ?? false,
    };
  }),

  /** Update user preferences (watch region, direct search, profile visibility) */
  setUserPreferences: protectedProcedure
    .input(setUserPreferencesInput)
    .mutation(async ({ ctx, input }) => {
      const updates: Partial<{
        watchRegion: string;
        directSearchEnabled: boolean;
        isPublic: boolean;
      }> = {};
      if (input.watchRegion !== undefined) updates.watchRegion = input.watchRegion;
      if (input.directSearchEnabled !== undefined)
        updates.directSearchEnabled = input.directSearchEnabled;
      if (input.isPublic !== undefined) updates.isPublic = input.isPublic;

      if (Object.keys(updates).length === 0) return { success: true };

      await ctx.db
        .update(user)
        .set(updates)
        .where(eq(user.id, ctx.session.user.id));
      return { success: true };
    }),
});
