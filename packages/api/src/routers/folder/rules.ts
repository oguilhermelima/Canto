import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  addServerLinkInput,
  getByMediaIdInput,
  listServerLinksInput,
  removeServerLinkInput,
  updateServerLinkInput,
} from "@canto/validators";
import { userConnection } from "@canto/db/schema";
import {
  findAllFolders,
  findAllServerLinks,
  findServerLinkById,
  removeServerLink,
  updateServerLink,
  upsertServerLink,
} from "@canto/core/infrastructure/repositories/file-organization/folder";
import { findMediaById } from "@canto/core/infrastructure/repositories/media/media-repository";
import { findWatchProvidersByMediaId } from "@canto/core/infrastructure/repositories/content-enrichment/extras";
import {
  dispatchJellyfinSync,
  dispatchPlexSync,
} from "@canto/core/infrastructure/queue/bullmq-dispatcher";
import { logAndSwallow } from "@canto/core/lib/log-error";
import {
  resolveFolder,
  type RoutableMedia,
} from "@canto/core/domain/rules/folder-routing";

import { protectedProcedure } from "../../trpc";

export const folderRulesProcedures = {
  resolve: protectedProcedure
    .input(getByMediaIdInput)
    .query(async ({ ctx, input }) => {
      const media = await findMediaById(ctx.db, input.mediaId);
      if (!media)
        throw new TRPCError({ code: "NOT_FOUND", message: "Media not found" });

      const [folders, watchProviders] = await Promise.all([
        findAllFolders(ctx.db),
        findWatchProvidersByMediaId(ctx.db, media.id),
      ]);
      const routable: RoutableMedia = {
        type: media.type,
        genres: media.genres,
        genreIds: media.genreIds,
        originCountry: media.originCountry,
        originalLanguage: media.originalLanguage,
        contentRating: media.contentRating,
        provider: media.provider,
        year: media.year,
        runtime: media.runtime,
        voteAverage: media.voteAverage,
        status: media.status,
        watchProviders: watchProviders.map((w) => ({
          providerId: w.providerId,
          region: w.region,
        })),
      };

      const folderId = resolveFolder(folders, routable);
      const folder = folderId ? folders.find((f) => f.id === folderId) : null;
      return { folderId, folderName: folder?.name ?? null };
    }),

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
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must have a connected account to add server links",
        });
      }

      const link = await upsertServerLink(ctx.db, {
        ...input,
        userConnectionId: userConnId,
      });

      if (input.syncEnabled) {
        if (input.serverType === "jellyfin") {
          await dispatchJellyfinSync().catch(
            logAndSwallow("folder.addServerLink:dispatchJellyfinSync"),
          );
        } else if (input.serverType === "plex") {
          await dispatchPlexSync().catch(
            logAndSwallow("folder.addServerLink:dispatchPlexSync"),
          );
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
            await dispatchJellyfinSync().catch(
              logAndSwallow("folder.updateServerLink:dispatchJellyfinSync"),
            );
          } else if (serverLink.serverType === "plex") {
            await dispatchPlexSync().catch(
              logAndSwallow("folder.updateServerLink:dispatchPlexSync"),
            );
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
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only remove your own server links",
          });
        }
      }
      await removeServerLink(ctx.db, input.id);
      return { success: true };
    }),
};
