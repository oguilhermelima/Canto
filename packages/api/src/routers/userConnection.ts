import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userConnection } from "@canto/db/schema";
import {
  addUserConnectionInput,
  deleteUserConnectionInput,
} from "@canto/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { createPlexPin, checkPlexPin, authenticatePlex } from "@canto/core/domain/use-cases/authenticate-plex";
import { authenticateJellyfin } from "@canto/core/domain/use-cases/authenticate-jellyfin";
import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "@canto/core/lib/settings-keys";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * After a userConnection is created/updated, auto-discover all accessible libraries
 * and enable them for sync. Dispatches a sync job when done.
 * Errors are swallowed so the connection is always saved regardless.
 */
async function setupLibrariesForConnection(
  db: Database,
  userId: string,
  provider: "jellyfin" | "plex",
  connectionId: string,
): Promise<void> {
  try {
    const { discoverServerLibraries } = await import(
      "@canto/core/domain/use-cases/discover-server-libraries"
    );
    const { upsertServerLink, updateServerLink } = await import(
      "@canto/core/infrastructure/repositories/folder-repository"
    );
    const { dispatchJellyfinSync, dispatchPlexSync } = await import(
      "@canto/core/infrastructure/queue/bullmq-dispatcher"
    );

    const libraries = await discoverServerLibraries(db, provider, userId);

    for (const lib of libraries) {
      if (!lib.linkId) {
        await upsertServerLink(db, {
          serverType: provider,
          serverLibraryId: lib.serverLibraryId,
          serverLibraryName: lib.serverLibraryName,
          serverPath: lib.serverPath ?? undefined,
          contentType: lib.contentType as "movies" | "shows",
          syncEnabled: true,
          userConnectionId: connectionId,
        });
      } else if (!lib.syncEnabled) {
        await updateServerLink(db, lib.linkId, { syncEnabled: true });
      }
    }

    if (provider === "jellyfin") {
      await dispatchJellyfinSync();
    } else {
      await dispatchPlexSync();
    }
  } catch (err) {
    console.warn("[userConnection] Failed to auto-setup libraries:", err instanceof Error ? err.message : err);
  }
}

/* -------------------------------------------------------------------------- */
/*  Router                                                                     */
/* -------------------------------------------------------------------------- */

export const userConnectionRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.userConnection.findMany({
      where: eq(userConnection.userId, ctx.session.user.id),
    });
  }),

  add: protectedProcedure
    .input(addUserConnectionInput)
    .mutation(async ({ ctx, input }) => {
      let token: string | undefined;
      let externalUserId: string | undefined;

      if (input.provider === "plex") {
        const url = await getSetting<string>(SETTINGS.PLEX_URL);
        if (!url) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Plex URL not configured by admin",
          });
        }
        const result = await authenticatePlex({ url, token: input.token });
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error ?? "Plex authentication failed",
          });
        }
        token = result.token;
        externalUserId = result.userId;
      } else if (input.provider === "jellyfin") {
        const url = await getSetting<string>(SETTINGS.JELLYFIN_URL);
        if (!url) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Jellyfin URL not configured by admin",
          });
        }
        const result = await authenticateJellyfin({
          url,
          username: input.username,
          password: input.password,
        });
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error ?? "Jellyfin authentication failed",
          });
        }
        token = result.token;
        externalUserId = result.userId;
      }

      if (!token || !externalUserId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to obtain authentication tokens",
        });
      }

      const [existing] = await ctx.db
        .select()
        .from(userConnection)
        .where(
          and(
            eq(userConnection.userId, ctx.session.user.id),
            eq(userConnection.provider, input.provider),
          ),
        );

      let connectionId: string;

      if (existing) {
        await ctx.db
          .update(userConnection)
          .set({ token, externalUserId, updatedAt: new Date() })
          .where(eq(userConnection.id, existing.id));
        connectionId = existing.id;
      } else {
        const [inserted] = await ctx.db
          .insert(userConnection)
          .values({
            userId: ctx.session.user.id,
            provider: input.provider,
            token,
            externalUserId,
          })
          .returning({ id: userConnection.id });
        connectionId = inserted!.id;
      }

      // Fire-and-forget: auto-discover all libraries and dispatch sync
      void setupLibrariesForConnection(ctx.db, ctx.session.user.id, input.provider, connectionId);

      return { success: true, id: connectionId };
    }),

  remove: protectedProcedure
    .input(deleteUserConnectionInput)
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(userConnection)
        .where(
          and(
            eq(userConnection.id, input.id),
            eq(userConnection.userId, ctx.session.user.id),
          ),
        );
      return { success: true };
    }),

  /**
   * On-demand reverse sync for the current user. Called by the web app on
   * mount / tab-focus so users see fresh playback state without waiting for
   * the 5-min scheduled sweep. Dedupes in the dispatcher via jobId.
   */
  syncNow: protectedProcedure.mutation(async ({ ctx }) => {
    const { dispatchUserReverseSync } = await import(
      "@canto/core/infrastructure/queue/bullmq-dispatcher"
    );
    const dispatched = await dispatchUserReverseSync(ctx.session.user.id);
    return { dispatched };
  }),

  // Plex PIN OAuth flow
  plexPinCreate: protectedProcedure.mutation(() => createPlexPin()),

  plexPinCheck: protectedProcedure
    .input(z.object({ pinId: z.number(), clientId: z.string() }))
    .query(async ({ ctx, input }) => {
      const serverUrl = (await getSetting<string>(SETTINGS.PLEX_URL)) ?? undefined;
      const result = await checkPlexPin({ ...input, serverUrl });

      if (result.authenticated && result.token) {
        const [existing] = await ctx.db
          .select()
          .from(userConnection)
          .where(
            and(
              eq(userConnection.userId, ctx.session.user.id),
              eq(userConnection.provider, "plex"),
            ),
          );

        let connectionId: string;

        if (existing) {
          await ctx.db
            .update(userConnection)
            .set({
              token: result.token,
              externalUserId: result.userId ?? existing.externalUserId,
              updatedAt: new Date(),
            })
            .where(eq(userConnection.id, existing.id));
          connectionId = existing.id;
        } else {
          const [inserted] = await ctx.db
            .insert(userConnection)
            .values({
              userId: ctx.session.user.id,
              provider: "plex",
              token: result.token,
              externalUserId: result.userId ?? "unknown",
            })
            .returning({ id: userConnection.id });
          connectionId = inserted!.id;
        }

        // Auto-discover libraries and dispatch sync
        void setupLibrariesForConnection(ctx.db, ctx.session.user.id, "plex", connectionId);
      }

      return result;
    }),
});
