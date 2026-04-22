import { TRPCError } from "@trpc/server";

import {
  addMediaPathInput,
  browseFolderInput,
  createQbitCategoryInput,
  listMediaPathsInput,
  removeMediaPathInput,
} from "@canto/validators";
import { getDownloadClient } from "@canto/core/infra/torrent-clients/download-client-factory";
import { createNodeFileSystemAdapter } from "@canto/core/platform/fs/filesystem";
import {
  addMediaPath,
  findMediaPathsByFolder,
  removeMediaPath,
} from "@canto/core/infra/file-organization/folder-repository";
import { validatePath } from "@canto/core/domain/file-organization/rules/validate-path";
import { browseFolder } from "@canto/core/domain/file-organization/use-cases/browse-folder";
import { testFolderPaths } from "@canto/core/domain/file-organization/use-cases/test-folder-paths";

import { adminProcedure } from "../../trpc";

export const folderPathsProcedures = {
  browse: adminProcedure
    .input(browseFolderInput)
    .query(({ input }) =>
      browseFolder(input.path, { fs: createNodeFileSystemAdapter() }),
    ),

  qbitCategories: adminProcedure.query(async () => {
    try {
      const client = await getDownloadClient();
      const [categories, defaultSavePath] = await Promise.all([
        client.listCategories(),
        client.getDefaultSavePath(),
      ]);
      return { categories, defaultSavePath };
    } catch {
      return {
        categories: {} as Record<string, { name: string; savePath: string }>,
        defaultSavePath: "",
      };
    }
  }),

  createQbitCategory: adminProcedure
    .input(createQbitCategoryInput)
    .mutation(async ({ input }) => {
      const client = await getDownloadClient();

      const existing = await client
        .listCategories()
        .catch(
          () => ({}) as Record<string, { name: string; savePath: string }>,
        );
      if (existing[input.name]) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Category "${input.name}" already exists in qBittorrent`,
        });
      }

      try {
        await client.createCategory(input.name, input.savePath);
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Failed to create category: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      // Validate the path by editing the category — qBittorrent rejects
      // unwritable save paths on editCategory (HTTP 409).
      try {
        await client.editCategory(input.name, input.savePath);
      } catch (err) {
        // Roll back the category we just created so the user can retry.
        await client.removeCategories([input.name]).catch(() => undefined);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `qBittorrent cannot write to "${input.savePath}". Verify the path exists and is mounted on the download client.`,
          cause: err instanceof Error ? err : undefined,
        });
      }

      return { name: input.name, savePath: input.savePath };
    }),

  testPaths: adminProcedure.mutation(({ ctx }) =>
    testFolderPaths(ctx.db, { fs: createNodeFileSystemAdapter() }),
  ),

  listMediaPaths: adminProcedure
    .input(listMediaPathsInput)
    .query(({ ctx, input }) => findMediaPathsByFolder(ctx.db, input.folderId)),

  addMediaPath: adminProcedure
    .input(addMediaPathInput)
    .mutation(({ ctx, input }) => {
      const normalized = validatePath(input.path);
      return addMediaPath(ctx.db, {
        folderId: input.folderId,
        path: normalized,
        label: input.label,
        source: input.source,
      });
    }),

  removeMediaPath: adminProcedure
    .input(removeMediaPathInput)
    .mutation(async ({ ctx, input }) => {
      await removeMediaPath(ctx.db, input.id);
      return { success: true };
    }),
};
