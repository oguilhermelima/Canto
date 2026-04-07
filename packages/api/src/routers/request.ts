import { TRPCError } from "@trpc/server";

import {
  getByIdInput,
  createRequestInput,
  listRequestsInput,
  resolveRequestInput,
} from "@canto/validators";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import {
  createDownloadRequest,
  findRequestsByUserPaginated,
  findAllRequestsPaginated,
  resolveRequest,
  cancelRequest,
} from "@canto/core/infrastructure/repositories/request-repository";

export const requestRouter = createTRPCRouter({
  /** Create a download request for a media item */
  create: protectedProcedure
    .input(createRequestInput)
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
    .input(listRequestsInput.optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const offset = input?.cursor ?? 0;

      if (ctx.session.user.role === "admin") {
        return findAllRequestsPaginated(ctx.db, { limit, offset });
      }
      return findRequestsByUserPaginated(ctx.db, ctx.session.user.id, {
        limit,
        offset,
      });
    }),

  /** Admin: approve or reject a request */
  resolve: adminProcedure
    .input(resolveRequestInput)
    .mutation(async ({ ctx, input }) => {
      const row = await resolveRequest(ctx.db, input.id, {
        status: input.status,
        adminNote: input.adminNote,
        resolvedBy: ctx.session.user.id,
      });
      if (!row) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Request has already been resolved",
        });
      }
      return row;
    }),

  /** Cancel own pending request */
  cancel: protectedProcedure
    .input(getByIdInput)
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
