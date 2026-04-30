import { TRPCError } from "@trpc/server";

import { getByIdInput, getByMediaIdInput } from "@canto/validators";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../../trpc";
import { findMediaFilesByMediaId } from "@canto/core/infra/media/media-file-repository";
import { setLibraryStatus } from "@canto/core/domain/lists/use-cases/manage-library-status";
import { makeListsRepository } from "@canto/core/infra/lists/lists-repository.adapter";
import { makeMediaRepository } from "@canto/core/infra/media/media-repository.adapter";
import { revertRequestStatus } from "@canto/core/infra/requests/request-repository";

export const mediaLibraryRouter = createTRPCRouter({
  addToLibrary: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      const media = makeMediaRepository(ctx.db);
      const updated = await setLibraryStatus({ repo, media }, input.id, { inLibrary: true });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return updated;
    }),

  markDownloaded: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeListsRepository(ctx.db);
      const media = makeMediaRepository(ctx.db);
      const updated = await setLibraryStatus({ repo, media }, input.id, { inLibrary: true, downloaded: true });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      return updated;
    }),

  removeFromLibrary: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const media = makeMediaRepository(ctx.db);
      const updated = await media.updateMedia(input.id, { inLibrary: false, downloaded: false });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });
      const repo = makeListsRepository(ctx.db);
      const serverLib = await repo.findServerLibrary();
      if (serverLib) await repo.removeItem(serverLib.id, input.id);
      await revertRequestStatus(ctx.db, input.id, "downloaded", "approved");
      return updated;
    }),

  delete: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      const media = makeMediaRepository(ctx.db);
      await media.deleteMedia(input.id);
      return { success: true };
    }),

  listFiles: protectedProcedure
    .input(getByMediaIdInput)
    .query(({ ctx, input }) => findMediaFilesByMediaId(ctx.db, input.mediaId)),
});
