import { TRPCError } from "@trpc/server";

import {
  createFolderInput,
  updateFolderInput,
  getByIdInput,
} from "@canto/validators";
import {
  findFolderById,
  findAllFolders,
  findAllFoldersWithLinks,
  createFolder,
  updateFolder,
  deleteFolder,
  setDefaultFolder,
  seedDefaultFolders,
} from "@canto/core/infra/file-organization/folder-repository";
import { validatePath } from "@canto/core/domain/file-organization/rules/validate-path";

import { adminProcedure } from "../../trpc";

export const folderManageProcedures = {
  list: adminProcedure.query(({ ctx }) => findAllFolders(ctx.db)),

  listWithLinks: adminProcedure.query(({ ctx }) =>
    findAllFoldersWithLinks(ctx.db),
  ),

  seed: adminProcedure.mutation(({ ctx }) => seedDefaultFolders(ctx.db)),

  create: adminProcedure
    .input(createFolderInput)
    .mutation(({ ctx, input }) =>
      createFolder(ctx.db, {
        name: input.name,
        downloadPath: input.downloadPath ? validatePath(input.downloadPath) : null,
        libraryPath: input.libraryPath ? validatePath(input.libraryPath) : null,
        qbitCategory: input.qbitCategory,
        rules: input.rules ?? null,
        priority: input.priority,
        isDefault: input.isDefault,
        downloadProfileId: input.downloadProfileId ?? null,
      }),
    ),

  update: adminProcedure
    .input(updateFolderInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await findFolderById(ctx.db, input.id);
      if (!existing)
        throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });

      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.downloadPath !== undefined)
        data.downloadPath = input.downloadPath
          ? validatePath(input.downloadPath)
          : null;
      if (input.libraryPath !== undefined)
        data.libraryPath = input.libraryPath
          ? validatePath(input.libraryPath)
          : null;
      if (input.qbitCategory !== undefined) data.qbitCategory = input.qbitCategory;
      if (input.rules !== undefined) data.rules = input.rules;
      if (input.priority !== undefined) data.priority = input.priority;
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;
      if (input.enabled !== undefined) data.enabled = input.enabled;
      if (input.downloadProfileId !== undefined)
        data.downloadProfileId = input.downloadProfileId;

      return updateFolder(ctx.db, input.id, data);
    }),

  delete: adminProcedure
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      await deleteFolder(ctx.db, input.id);
      return { success: true };
    }),

  setDefault: adminProcedure
    .input(getByIdInput)
    .mutation(({ ctx, input }) => setDefaultFolder(ctx.db, input.id)),
};
