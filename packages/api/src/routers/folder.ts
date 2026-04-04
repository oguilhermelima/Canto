import { access, constants } from "node:fs/promises";
import nodePath from "node:path";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createFolderInput, updateFolderInput, addServerLinkInput, removeServerLinkInput } from "@canto/validators";

import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import { resolveFolder } from "../domain/rules/folder-routing";
import type { RoutableMedia } from "../domain/rules/folder-routing";
import {
  findFolderById,
  findAllFolders,
  findAllFoldersWithLinks,
  findDefaultFolder,
  createFolder,
  updateFolder,
  deleteFolder,
  setDefaultFolder,
  seedDefaultFolders,
  findServerLinksByFolder,
  upsertServerLink,
  removeServerLink,
  findAllServerLinks,
} from "../infrastructure/repositories/folder-repository";
import { findMediaById } from "../infrastructure/repositories/media-repository";

function validatePath(p: string): string {
  const normalized = nodePath.normalize(p);
  if (normalized.includes("..")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Path "${p}" contains invalid traversal segments` });
  }
  if (!nodePath.isAbsolute(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Path "${p}" must be absolute` });
  }
  return normalized;
}

export const folderRouter = createTRPCRouter({
  // ── CRUD ──

  list: adminProcedure.query(({ ctx }) => findAllFolders(ctx.db)),

  listWithLinks: adminProcedure.query(({ ctx }) => findAllFoldersWithLinks(ctx.db)),

  seed: adminProcedure.mutation(({ ctx }) => seedDefaultFolders(ctx.db)),

  create: adminProcedure
    .input(createFolderInput)
    .mutation(async ({ ctx, input }) => {
      return createFolder(ctx.db, {
        name: input.name,
        downloadPath: input.downloadPath ? validatePath(input.downloadPath) : null,
        libraryPath: input.libraryPath ? validatePath(input.libraryPath) : null,
        qbitCategory: input.qbitCategory,
        rules: input.rules ?? null,
        priority: input.priority,
        isDefault: input.isDefault,
      });
    }),

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

  // ── Resolve — auto-select folder for a media item ──

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

      return {
        folderId,
        folderName: folder?.name ?? null,
      };
    }),

  // ── Path management ──

  testPaths: adminProcedure.mutation(async ({ ctx }) => {
    const folders = await findAllFolders(ctx.db);
    const results: Array<{
      name: string;
      downloadPath: { ok: boolean; error?: string };
      libraryPath: { ok: boolean; error?: string };
    }> = [];

    for (const folder of folders) {
      const dl = await testPath(folder.downloadPath);
      const lib = await testPath(folder.libraryPath);
      results.push({ name: folder.name, downloadPath: dl, libraryPath: lib });
    }

    return results;
  }),

  // ── Server Links ──

  listServerLinks: adminProcedure
    .input(z.object({ folderId: z.string().uuid() }))
    .query(({ ctx, input }) => findServerLinksByFolder(ctx.db, input.folderId)),

  listAllServerLinks: adminProcedure
    .input(z.object({ serverType: z.enum(["jellyfin", "plex"]).optional() }).optional())
    .query(({ ctx, input }) => findAllServerLinks(ctx.db, input?.serverType)),

  addServerLink: adminProcedure
    .input(addServerLinkInput)
    .mutation(({ ctx, input }) => upsertServerLink(ctx.db, input)),

  removeServerLink: adminProcedure
    .input(removeServerLinkInput)
    .mutation(async ({ ctx, input }) => {
      await removeServerLink(ctx.db, input.id);
      return { success: true };
    }),
});

async function testPath(p: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!p) return { ok: false, error: "Not configured" };
  try {
    await access(p, constants.R_OK | constants.W_OK);
    return { ok: true };
  } catch {
    return { ok: false, error: `Path "${p}" is not accessible or writable` };
  }
}
