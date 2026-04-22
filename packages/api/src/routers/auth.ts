import { eq } from "drizzle-orm";
import { setUserPreferencesInput, updateProfileInput } from "@canto/validators";
import { user } from "@canto/db/schema";
import {
  findAllUsers,
  getUserPreferences,
  setUserPreferences,
  getUserProfile,
  updateUserProfile,
} from "@canto/core/infra/user/user-aggregate-repository";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";

export const authRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),

  list: adminProcedure.query(({ ctx }) => findAllUsers(ctx.db)),

  isOnboardingCompleted: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ completed: user.onboardingCompleted })
      .from(user)
      .where(eq(user.id, ctx.session.user.id));
    return row?.completed === true;
  }),

  completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(user)
      .set({ onboardingCompleted: true })
      .where(eq(user.id, ctx.session.user.id));
    return { success: true };
  }),

  getUserPreferences: protectedProcedure.query(({ ctx }) =>
    getUserPreferences(ctx.db, ctx.session.user.id),
  ),

  setUserPreferences: protectedProcedure
    .input(setUserPreferencesInput)
    .mutation(async ({ ctx, input }) => {
      await setUserPreferences(ctx.db, ctx.session.user.id, input);
      return { success: true };
    }),

  updateProfile: protectedProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      await updateUserProfile(ctx.db, ctx.session.user.id, input);
      return { success: true };
    }),

  getProfile: protectedProcedure.query(({ ctx }) =>
    getUserProfile(ctx.db, ctx.session.user.id),
  ),
});
