import { initTRPC, TRPCError } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";
import superjson from "superjson";
import { ZodError } from "zod";

import type { Database } from "@canto/db/client";
import { DomainError } from "@canto/core/domain/errors";

export interface Context {
  db: Database;
  session: { user: { id: string; name: string; email: string; role: string } } | null;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

const DOMAIN_TO_TRPC: Record<DomainError["code"], TRPC_ERROR_CODE_KEY> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  UNAUTHORIZED: "UNAUTHORIZED",
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL_SERVER_ERROR",
};

const mapDomainErrors = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    if (err instanceof DomainError) {
      throw new TRPCError({ code: DOMAIN_TO_TRPC[err.code], message: err.message, cause: err });
    }
    throw err;
  }
});

export { t };
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure.use(mapDomainErrors);

export const protectedProcedure = t.procedure.use(mapDomainErrors).use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const adminProcedure = t.procedure.use(mapDomainErrors).use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (ctx.session.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});
