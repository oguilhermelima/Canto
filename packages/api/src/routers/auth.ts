import { eq } from "drizzle-orm";
import { setUserPreferencesInput, updateProfileInput } from "@canto/validators";
import { user } from "@canto/db/schema";
import type { UserId } from "@canto/core/domain/user/types/user";
import { makeUserRepository } from "@canto/core/infra/user/user-repository.adapter";
import {
  createTRPCRouter,
  adminProcedure,
  protectedProcedure,
  publicProcedure,
} from "../trpc";

export const authRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),

  list: adminProcedure.query(({ ctx }) => {
    const userRepo = makeUserRepository(ctx.db);
    return userRepo.findAll();
  }),

  hasAnyUser: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select({ id: user.id }).from(user).limit(1);
    return rows.length > 0;
  }),

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

  getUserPreferences: protectedProcedure.query(({ ctx }) => {
    const userRepo = makeUserRepository(ctx.db);
    return userRepo.findPreferences(ctx.session.user.id as UserId);
  }),

  setUserPreferences: protectedProcedure
    .input(setUserPreferencesInput)
    .mutation(async ({ ctx, input }) => {
      const userRepo = makeUserRepository(ctx.db);
      await userRepo.setPreferences(ctx.session.user.id as UserId, input);
      return { success: true };
    }),

  updateProfile: protectedProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      const userRepo = makeUserRepository(ctx.db);
      await userRepo.updateProfile(ctx.session.user.id as UserId, input);
      return { success: true };
    }),

  getProfile: protectedProcedure.query(({ ctx }) => {
    const userRepo = makeUserRepository(ctx.db);
    return userRepo.findProfileMetadata(ctx.session.user.id as UserId);
  }),
});
