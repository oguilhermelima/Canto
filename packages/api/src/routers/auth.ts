import { setUserPreferencesInput, updateProfileInput } from "@canto/validators";
import {
  findAllUsers,
  getUserPreferences,
  setUserPreferences,
  getUserProfile,
  updateUserProfile,
} from "@canto/core/infrastructure/repositories/user-repository";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";

export const authRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),

  list: adminProcedure.query(({ ctx }) => findAllUsers(ctx.db)),

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
