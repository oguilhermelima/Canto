import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import {
  createDownloadRequest,
  findRequestsByUser,
  findAllRequests,
  findRequestById,
  resolveRequest,
  cancelRequest,
} from "../infrastructure/repositories/request-repository";

export const requestRouter = createTRPCRouter({
  /** Create a download request for a media item */
  create: protectedProcedure
    .input(
      z.object({
        mediaId: z.string().uuid(),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await createDownloadRequest(ctx.db, {
        userId: ctx.session.user.id,
        mediaId: input.mediaId,
        note: input.note,
      });
      if (!row) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have a request for this media",
        });
      }
      return row;
    }),

  /** List requests — users see their own, admin sees all */
  list: protectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["pending", "approved", "rejected", "downloaded", "cancelled"])
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.user.role === "admin") {
        return findAllRequests(ctx.db, input?.status);
      }
      return findRequestsByUser(ctx.db, ctx.session.user.id, input?.status);
    }),

  /** Admin: approve or reject a request */
  resolve: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["approved", "rejected"]),
        adminNote: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await findRequestById(ctx.db, input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (existing.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Request has already been resolved",
        });
      }

      return resolveRequest(ctx.db, input.id, {
        status: input.status,
        adminNote: input.adminNote,
        resolvedBy: ctx.session.user.id,
      });
    }),

  /** Cancel own pending request */
  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await cancelRequest(
        ctx.db,
        input.id,
        ctx.session.user.id,
      );
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found or not cancellable",
        });
      }
      return row;
    }),
});
