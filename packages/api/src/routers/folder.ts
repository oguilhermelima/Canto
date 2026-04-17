import nodePath from "node:path";
import { readdir } from "node:fs/promises";

import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";

import {
  createFolderInput,
  updateFolderInput,
  addServerLinkInput,
  removeServerLinkInput,
  addMediaPathInput,
  removeMediaPathInput,
  getByIdInput,
  getByMediaIdInput,
  browseFolderInput,
  listServerLinksInput,
  updateServerLinkInput,
  listMediaPathsInput,
  createQbitCategoryInput,
} from "@canto/validators";

import { userConnection } from "@canto/db/schema";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "../trpc";
import { getDownloadClient } from "@canto/core/infrastructure/adapters/download-client-factory";
import { resolveFolder } from "@canto/core/domain/rules/folder-routing";
import type { RoutableMedia } from "@canto/core/domain/rules/folder-routing";
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
  findServerLinkById,
  addMediaPath,
  removeMediaPath,
} from "@canto/core/infrastructure/repositories/folder-repository";
import { findMediaById } from "@canto/core/infrastructure/repositories/media-repository";
import { dispatchJellyfinSync, dispatchPlexSync } from "@canto/core/infrastructure/queue/bullmq-dispatcher";
import { logAndSwallow } from "@canto/core/lib/log-error";

// ── Extracted rules & use-cases ──
import { validatePath } from "@canto/core/domain/rules/validate-path";
import { testFolderPaths } from "@canto/core/domain/use-cases/test-folder-paths";

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
    .input(getByIdInput)
    .mutation(async ({ ctx, input }) => {
      await deleteFolder(ctx.db, input.id);
      return { success: true };
    }),

  setDefault: adminProcedure
    .input(getByIdInput)
    .mutation(({ ctx, input }) => setDefaultFolder(ctx.db, input.id)),

  resolve: protectedProcedure
    .input(getByMediaIdInput)
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
    .input(browseFolderInput)
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

  createQbitCategory: adminProcedure
    .input(createQbitCategoryInput)
    .mutation(async ({ input }) => {
      const client = await getDownloadClient();

      const existing = await client.listCategories().catch(() => ({} as Record<string, { name: string; savePath: string }>));
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

  testPaths: adminProcedure.mutation(({ ctx }) => testFolderPaths(ctx.db)),

  listAllServerLinks: protectedProcedure
    .input(listServerLinksInput.optional())
    .query(async ({ ctx, input }) => {
      let userConnId: string | undefined;
      if (input?.serverType) {
        const conn = await ctx.db.query.userConnection.findFirst({
          where: and(
            eq(userConnection.userId, ctx.session.user.id),
            eq(userConnection.provider, input.serverType),
          ),
        });
        userConnId = conn?.id;
      }
      return findAllServerLinks(ctx.db, input?.serverType, userConnId);
    }),

  addServerLink: protectedProcedure
    .input(addServerLinkInput)
    .mutation(async ({ ctx, input }) => {
      let userConnId = input.userConnectionId;

      if (!userConnId) {
        const conn = await ctx.db.query.userConnection.findFirst({
          where: and(
            eq(userConnection.userId, ctx.session.user.id),
            eq(userConnection.provider, input.serverType),
          ),
        });
        userConnId = conn?.id;
      }

      if (!userConnId && ctx.session.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You must have a connected account to add server links" });
      }

      const link = await upsertServerLink(ctx.db, {
        ...input,
        userConnectionId: userConnId,
      });

      if (input.syncEnabled) {
        if (input.serverType === "jellyfin") {
          await dispatchJellyfinSync().catch(logAndSwallow("folder.addServerLink:dispatchJellyfinSync"));
        } else if (input.serverType === "plex") {
          await dispatchPlexSync().catch(logAndSwallow("folder.addServerLink:dispatchPlexSync"));
        }
      }

      return link;
    }),

  updateServerLink: protectedProcedure
    .input(updateServerLinkInput)
    .mutation(async ({ ctx, input }) => {
      const data: Record<string, unknown> = {};
      if (input.syncEnabled !== undefined) data.syncEnabled = input.syncEnabled;
      const link = await updateServerLink(ctx.db, input.id, data);

      if (input.syncEnabled === true) {
        const serverLink = await findServerLinkById(ctx.db, input.id);
        if (serverLink) {
          if (serverLink.serverType === "jellyfin") {
            await dispatchJellyfinSync().catch(logAndSwallow("folder.updateServerLink:dispatchJellyfinSync"));
          } else if (serverLink.serverType === "plex") {
            await dispatchPlexSync().catch(logAndSwallow("folder.updateServerLink:dispatchPlexSync"));
          }
        }
      }

      return link;
    }),

  removeServerLink: protectedProcedure
    .input(removeServerLinkInput)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role !== "admin") {
        const link = await findServerLinkById(ctx.db, input.id);
        if (!link) throw new TRPCError({ code: "NOT_FOUND" });
        // Non-admins can only delete links owned by their own connections
        const conn = link.userConnectionId
          ? await ctx.db.query.userConnection.findFirst({
              where: and(
                eq(userConnection.id, link.userConnectionId),
                eq(userConnection.userId, ctx.session.user.id),
              ),
            })
          : null;
        if (!conn) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only remove your own server links" });
        }
      }
      await removeServerLink(ctx.db, input.id);
      return { success: true };
    }),

  listMediaPaths: adminProcedure
    .input(listMediaPathsInput)
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
