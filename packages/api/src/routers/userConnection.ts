import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@canto/db/client";
import { userConnection } from "@canto/db/schema";
import {
  addUserConnectionInput,
  deleteUserConnectionInput,
  traktDeviceCheckInput,
  checkPlexPinInput,
} from "@canto/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  createPlexPin,
  checkPlexPin,
  authenticatePlex,
  loginPlex,
  authenticateJellyfin,
} from "@canto/core/domain/use-cases/authenticate-media-server";
import { getJellyfinCurrentUserId } from "@canto/core/infrastructure/adapters/jellyfin";
import { authenticatePlexServerToken } from "@canto/core/infrastructure/adapters/plex";
import {
  createTraktDeviceCode,
  exchangeTraktDeviceCode,
  getTraktUserSettings,
  TraktConfigurationError,
  TraktHttpError,
} from "@canto/core/infrastructure/adapters/trakt";
import { getSetting } from "@canto/db/settings";
import { discoverServerLibraries } from "@canto/core/domain/use-cases/discover-server-libraries";
import { upsertServerLink } from "@canto/core/infrastructure/repositories/folder-repository";
import {
  dispatchJellyfinSync,
  dispatchPlexSync,
  dispatchUserReverseSync,
  dispatchUserTraktSync,
} from "@canto/core/infrastructure/queue/bullmq-dispatcher";
import { logAndSwallow } from "@canto/core/lib/log-error";

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
    const libraries = await discoverServerLibraries(db, provider, userId);

    for (const lib of libraries) {
      // Always upsert per-user links — global (admin) links are left untouched
      await upsertServerLink(db, {
        serverType: provider,
        serverLibraryId: lib.serverLibraryId,
        serverLibraryName: lib.serverLibraryName,
        serverPath: lib.serverPath ?? undefined,
        contentType: lib.contentType as "movies" | "shows",
        syncEnabled: true,
        userConnectionId: connectionId,
      });
    }

    if (provider === "jellyfin") {
      await dispatchJellyfinSync();
    } else {
      await dispatchPlexSync();
    }
  } catch (err) {
    logAndSwallow("userConnection:setupLibrariesForConnection")(err);
  }
}

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
        const url = await getSetting("plex.url");
        if (!url) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Plex URL not configured by admin",
          });
        }
        const result = input.credentials.mode === "email"
          ? await loginPlex({
              url,
              email: input.credentials.email,
              password: input.credentials.password,
            })
          : await authenticatePlex({ url, token: input.credentials.token });
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error ?? "Plex authentication failed",
          });
        }
        token = result.token;
        externalUserId = result.userId;
      } else if (input.provider === "jellyfin") {
        const url = await getSetting("jellyfin.url");
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
          .set({
            token,
            refreshToken: null,
            tokenExpiresAt: null,
            externalUserId,
            staleReason: null,
            updatedAt: new Date(),
          })
          .where(eq(userConnection.id, existing.id));
        connectionId = existing.id;
      } else {
        const [inserted] = await ctx.db
          .insert(userConnection)
          .values({
            userId: ctx.session.user.id,
            provider: input.provider,
            token,
            refreshToken: null,
            tokenExpiresAt: null,
            externalUserId,
          })
          .returning({ id: userConnection.id });
        connectionId = inserted!.id;
      }

      void setupLibrariesForConnection(ctx.db, ctx.session.user.id, input.provider, connectionId);

      return { success: true, id: connectionId };
    }),

  /**
   * Link the current user to the admin-configured media-server account.
   * Used by the user onboarding "Use the server's account" option — copies
   * the admin token into a per-user userConnection so the user shares the
   * admin's media library view (sensible for family/single-user setups).
   */
  reuseAdminCreds: protectedProcedure
    .input(z.object({ provider: z.enum(["jellyfin", "plex"]) }))
    .mutation(async ({ ctx, input }) => {
      const url = await getSetting(input.provider === "jellyfin" ? "jellyfin.url" : "plex.url");
      if (!url) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${input.provider === "jellyfin" ? "Jellyfin" : "Plex"} is not configured on the server`,
        });
      }

      let token: string | undefined;
      let externalUserId: string | undefined;

      if (input.provider === "jellyfin") {
        const apiKey = await getSetting("jellyfin.apiKey");
        if (!apiKey) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Jellyfin admin credentials are not configured",
          });
        }
        const jellyfinUserId = await getJellyfinCurrentUserId(url, apiKey);
        if (!jellyfinUserId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not resolve Jellyfin user from admin credentials",
          });
        }
        token = apiKey;
        externalUserId = jellyfinUserId;
      } else {
        const plexToken = await getSetting("plex.token");
        if (!plexToken) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Plex admin credentials are not configured",
          });
        }
        const result = await authenticatePlexServerToken(url, plexToken);
        if (!result.ok || !result.userId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not validate Plex admin token",
          });
        }
        token = plexToken;
        externalUserId = result.userId;
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
          .set({
            token,
            refreshToken: null,
            tokenExpiresAt: null,
            externalUserId,
            staleReason: null,
            updatedAt: new Date(),
          })
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
    const [reverseDispatched, traktDispatched] = await Promise.all([
      dispatchUserReverseSync(ctx.session.user.id),
      dispatchUserTraktSync(ctx.session.user.id),
    ]);
    return { dispatched: reverseDispatched || traktDispatched };
  }),

  plexPinCreate: protectedProcedure.mutation(() => createPlexPin()),

  plexPinCheck: protectedProcedure
    .input(checkPlexPinInput)
    .query(async ({ ctx, input }) => {
      const serverUrl = input.serverUrl ?? (await getSetting("plex.url")) ?? undefined;
      const result = await checkPlexPin({
        pinId: input.pinId,
        clientId: input.clientId,
        serverUrl,
      });

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

        void setupLibrariesForConnection(ctx.db, ctx.session.user.id, "plex", connectionId);
      }

      return result;
    }),

  traktDeviceCreate: protectedProcedure.mutation(async () => {
    try {
      return await createTraktDeviceCode();
    } catch (err) {
      if (err instanceof TraktConfigurationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err.message,
        });
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err instanceof Error ? err.message : "Trakt authorization could not be started",
      });
    }
  }),

  traktDeviceCheck: protectedProcedure
    .input(traktDeviceCheckInput)
    .query(async ({ ctx, input }) => {
      try {
        const tokenData = await exchangeTraktDeviceCode(input.deviceCode);
        const userSettings = await getTraktUserSettings(tokenData.access_token);
        const externalUserId = userSettings.user.ids.slug || userSettings.user.username;
        const expiresAt = new Date(
          (tokenData.created_at + tokenData.expires_in) * 1000,
        );

        const [existing] = await ctx.db
          .select()
          .from(userConnection)
          .where(
            and(
              eq(userConnection.userId, ctx.session.user.id),
              eq(userConnection.provider, "trakt"),
            ),
          );

        if (existing) {
          await ctx.db
            .update(userConnection)
            .set({
              token: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              tokenExpiresAt: expiresAt,
              externalUserId,
              staleReason: null,
              updatedAt: new Date(),
            })
            .where(eq(userConnection.id, existing.id));
        } else {
          await ctx.db
            .insert(userConnection)
            .values({
              userId: ctx.session.user.id,
              provider: "trakt",
              token: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              tokenExpiresAt: expiresAt,
              externalUserId,
            });
        }

        void dispatchUserTraktSync(ctx.session.user.id);

        return { authenticated: true, pending: false, expired: false };
      } catch (err) {
        if (err instanceof TraktConfigurationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err.message,
          });
        }
        if (err instanceof TraktHttpError && err.status === 400) {
          const message = err.message.toLowerCase();
          if (
            message.includes("expired_token")
            || message.includes("access_denied")
            || message.includes("invalid_grant")
          ) {
            return { authenticated: false, pending: false, expired: true };
          }

          // Trakt's device token endpoint can return bare 400 responses during
          // polling without a stable error body. Treat unknown 400 as pending
          // so the UI keeps polling instead of showing a hard failure.
          if (
            message.includes("invalid_client")
            || message.includes("invalid_request")
            || message.includes("unauthorized_client")
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err.message,
            });
          }

          return { authenticated: false, pending: true, expired: false };
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Trakt authentication failed",
        });
      }
    }),
});
