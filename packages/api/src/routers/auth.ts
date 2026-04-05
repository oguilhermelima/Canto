import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { user } from "@canto/db/schema";
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

  /** Get user preferences (watch region & direct search) */
  getUserPreferences: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        watchRegion: user.watchRegion,
        directSearchEnabled: user.directSearchEnabled,
      })
      .from(user)
      .where(eq(user.id, ctx.session.user.id));
    return {
      watchRegion: row?.watchRegion ?? null,
      directSearchEnabled: row?.directSearchEnabled ?? true,
    };
  }),

  /** Update user preferences (watch region & direct search) */
  setUserPreferences: protectedProcedure
    .input(
      z.object({
        watchRegion: z.string().max(10).optional(),
        directSearchEnabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updates: Partial<{
        watchRegion: string;
        directSearchEnabled: boolean;
      }> = {};
      if (input.watchRegion !== undefined) updates.watchRegion = input.watchRegion;
      if (input.directSearchEnabled !== undefined)
        updates.directSearchEnabled = input.directSearchEnabled;

      if (Object.keys(updates).length === 0) return;

      await ctx.db
        .update(user)
        .set(updates)
        .where(eq(user.id, ctx.session.user.id));
    }),
});
