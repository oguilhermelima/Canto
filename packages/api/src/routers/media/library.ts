import { TRPCError } from "@trpc/server";

import { getByIdInput, getByMediaIdInput } from "@canto/validators";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../../trpc";
import {
  updateMedia,
  deleteMedia,
} from "@canto/core/infra/media/media-repository";
import { findMediaFilesByMediaId } from "@canto/core/infra/media/media-file-repository";
import { setLibraryStatus } from "@canto/core/domain/use-cases/lists/manage-library-status";
import { findServerLibrary, removeListItem } from "@canto/core/infra/lists/list-repository";
import { revertRequestStatus } from "@canto/core/infra/repositories";

export const mediaLibraryRouter = createTRPCRouter({
  addToLibrary: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await setLibraryStatus(ctx.db, input.id, { inLibrary: true });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return updated;
    }),

  markDownloaded: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await setLibraryStatus(ctx.db, input.id, { inLibrary: true, downloaded: true });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return updated;
    }),

  removeFromLibrary: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const updated = await updateMedia(ctx.db, input.id, { inLibrary: false, downloaded: false });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      const serverLib = await findServerLibrary(ctx.db);
      if (serverLib) await removeListItem(ctx.db, serverLib.id, input.id);
      await revertRequestStatus(ctx.db, input.id, "downloaded", "approved");
      return updated;
    }),

  delete: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteMedia(ctx.db, input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return { success: true };
    }),

  listFiles: protectedProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) => findMediaFilesByMediaId(ctx.db, input.mediaId)),
});
