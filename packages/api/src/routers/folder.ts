import nodePath from "node:path";
import { readdir } from "node:fs/promises";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createFolderInput, updateFolderInput, addServerLinkInput, removeServerLinkInput, addMediaPathInput, removeMediaPathInput } from "@canto/validators";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import { getDownloadClient } from "../infrastructure/adapters/download-client-factory";
import { resolveFolder } from "../domain/rules/folder-routing";
import type { RoutableMedia } from "../domain/rules/folder-routing";
import {
  findFolderById,
  findAllFolders,
  findAllFoldersWithLinks,
  createFolder,
  updateFolder,
  deleteFolder,
  setDefaultFolder,
  seedDefaultFolders,
  upsertServerLink,
  updateServerLink,
  removeServerLink,
  findAllServerLinks,
  findMediaPathsByFolder,
  addMediaPath,
  removeMediaPath,
} from "../infrastructure/repositories/folder-repository";
import { findMediaById } from "../infrastructure/repositories/media-repository";

// ── Extracted rules & use-cases ──
import { validatePath } from "../domain/rules/validate-path";
import { testFolderPaths } from "../domain/use-cases/test-folder-paths";

export const folderRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) => findAllFolders(ctx.db)),

  listWithLinks: adminProcedure.query(({ ctx }) => findAllFoldersWithLinks(ctx.db)),

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
      }),
    ),

  update: adminProcedure
    .input(updateFolderInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await findFolderById(ctx.db, input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });

      const data: Record<string, unknown> = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.downloadPath !== undefined) data.downloadPath = input.downloadPath ? validatePath(input.downloadPath) : null;
      if (input.libraryPath !== undefined) data.libraryPath = input.libraryPath ? validatePath(input.libraryPath) : null;
      if (input.qbitCategory !== undefined) data.qbitCategory = input.qbitCategory;
      if (input.rules !== undefined) data.rules = input.rules;
      if (input.priority !== undefined) data.priority = input.priority;
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;
      if (input.enabled !== undefined) data.enabled = input.enabled;

      return updateFolder(ctx.db, input.id, data);
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await deleteFolder(ctx.db, input.id);
      return { success: true };
    }),

  setDefault: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => setDefaultFolder(ctx.db, input.id)),

  resolve: protectedProcedure
    .input(z.object({ mediaId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const media = await findMediaById(ctx.db, input.mediaId);
      if (!media) throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });

      const folders = await findAllFolders(ctx.db);
      const routable: RoutableMedia = {
        type: media.type,
        genres: media.genres,
        genreIds: media.genreIds,
        originCountry: media.originCountry,
        originalLanguage: media.originalLanguage,
        contentRating: media.contentRating,
        provider: media.provider,
      };

      const folderId = resolveFolder(folders, routable);
      const folder = folderId ? folders.find((f) => f.id === folderId) : null;
      return { folderId, folderName: folder?.name ?? null };
    }),

  browse: adminProcedure
    .input(z.object({ path: z.string().default("/") }))
    .query(async ({ input }) => {
      const normalized = nodePath.resolve(input.path);
      try {
        const entries = await readdir(normalized, { withFileTypes: true });
        const dirs = entries
          .filter((e) => e.isDirectory() && !e.name.startsWith("."))
          .map((e) => ({ name: e.name, path: nodePath.join(normalized, e.name) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return { path: normalized, parent: nodePath.dirname(normalized), dirs };
      } catch {
        return { path: normalized, parent: nodePath.dirname(normalized), dirs: [] };
      }
    }),

  qbitCategories: adminProcedure.query(async () => {
    try {
      const client = await getDownloadClient();
      const [categories, defaultSavePath] = await Promise.all([
        client.listCategories(),
        client.getDefaultSavePath(),
      ]);
      return { categories, defaultSavePath };
    } catch {
      return { categories: {} as Record<string, { name: string; savePath: string }>, defaultSavePath: "" };
    }
  }),

  testPaths: adminProcedure.mutation(({ ctx }) => testFolderPaths(ctx.db)),

  listAllServerLinks: adminProcedure
    .input(z.object({ serverType: z.enum(["jellyfin", "plex"]).optional() }).optional())
    .query(({ ctx, input }) => findAllServerLinks(ctx.db, input?.serverType)),

  addServerLink: adminProcedure
    .input(addServerLinkInput)
    .mutation(({ ctx, input }) => upsertServerLink(ctx.db, input)),

  updateServerLink: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      syncEnabled: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const data: Record<string, unknown> = {};
      if (input.syncEnabled !== undefined) data.syncEnabled = input.syncEnabled;
      return updateServerLink(ctx.db, input.id, data);
    }),

  removeServerLink: adminProcedure
    .input(removeServerLinkInput)
    .mutation(async ({ ctx, input }) => {
      await removeServerLink(ctx.db, input.id);
      return { success: true };
    }),

  listMediaPaths: adminProcedure
    .input(z.object({ folderId: z.string().uuid() }))
    .query(({ ctx, input }) => findMediaPathsByFolder(ctx.db, input.folderId)),

  addMediaPath: adminProcedure
    .input(addMediaPathInput)
    .mutation(async ({ ctx, input }) => {
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
});
