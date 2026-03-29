import { createTRPCRouter, protectedProcedure } from "../trpc";

export const authRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => {
    return ctx.session.user;
  }),
});
