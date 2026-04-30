import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Database } from "@canto/db/client";
import { getSetting } from "@canto/db/settings";
import { addUserConnectionInput } from "@canto/validators";
import {
  authenticateJellyfin,
  authenticatePlex,
  loginPlex,
} from "@canto/core/domain/media-servers/use-cases/authenticate";
import { discoverServerLibraries } from "@canto/core/domain/media-servers/use-cases/discover-libraries";
import { makeJellyfinAdapter } from "@canto/core/infra/media-servers/jellyfin.adapter-bindings";
import { makePlexAdapter } from "@canto/core/infra/media-servers/plex.adapter-bindings";
import { makeUserConnectionRepository } from "@canto/core/infra/media-servers/user-connection-repository.adapter";
import { upsertServerLink } from "@canto/core/infra/file-organization/folder-repository";
import {
  dispatchJellyfinSync,
  dispatchPlexSync,
} from "@canto/core/platform/queue/bullmq-dispatcher";
import { logAndSwallow } from "@canto/core/platform/logger/log-error";
import { createTRPCRouter, protectedProcedure } from "../../trpc";

/**
 * After a userConnection is created/updated, auto-discover all accessible libraries
 * and enable them for sync. Dispatches a sync job when done. Errors are swallowed
 * so the connection is always saved regardless.
 */
export async function setupLibrariesForConnection(
  db: Database,
  userId: string,
  provider: "jellyfin" | "plex",
  connectionId: string,
): Promise<void> {
  try {
    const libraries = await discoverServerLibraries(
      db,
      provider,
      {
        repo: makeUserConnectionRepository(db),
        plex: makePlexAdapter(),
        jellyfin: makeJellyfinAdapter(),
      },
      userId,
    );

    for (const lib of libraries) {
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

export const setupRouter = createTRPCRouter({
  add: protectedProcedure
    .input(addUserConnectionInput)
    .mutation(async ({ ctx, input }) => {
      const repo = makeUserConnectionRepository(ctx.db);
      const plex = makePlexAdapter();
      const jellyfin = makeJellyfinAdapter();

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
        const result =
          input.credentials.mode === "email"
            ? await loginPlex(
                {
                  url,
                  email: input.credentials.email,
                  password: input.credentials.password,
                },
                { plex },
              )
            : await authenticatePlex(
                { url, token: input.credentials.token },
                { plex },
              );
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error ?? "Plex authentication failed",
          });
        }
        token = result.token;
        externalUserId = result.userId;
      } else {
        const url = await getSetting("jellyfin.url");
        if (!url) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Jellyfin URL not configured by admin",
          });
        }
        const result = await authenticateJellyfin(
          {
            url,
            username: input.username,
            password: input.password,
          },
          { jellyfin },
        );
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

      const existing = await repo.findByProvider(
        ctx.session.user.id,
        input.provider,
      );

      let connectionId: string;

      if (existing) {
        await repo.update(existing.id, {
          token,
          refreshToken: null,
          tokenExpiresAt: null,
          externalUserId,
          staleReason: null,
        });
        connectionId = existing.id;
      } else {
        const inserted = await repo.create({
          userId: ctx.session.user.id,
          provider: input.provider,
          token,
          refreshToken: null,
          tokenExpiresAt: null,
          externalUserId,
        });
        connectionId = inserted.id;
      }

      void setupLibrariesForConnection(ctx.db, ctx.session.user.id, input.provider, connectionId);

      return { success: true, id: connectionId };
    }),

  /**
   * Link the current user to the admin-configured media-server account.
   * Copies the admin token into a per-user userConnection so the user shares
   * the admin's media library view (sensible for family/single-user setups).
   */
  reuseAdminCreds: protectedProcedure
    .input(z.object({ provider: z.enum(["jellyfin", "plex"]) }))
    .mutation(async ({ ctx, input }) => {
      const repo = makeUserConnectionRepository(ctx.db);
      const plex = makePlexAdapter();
      const jellyfin = makeJellyfinAdapter();

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
        // Prefer the admin user id captured during onboarding — Jellyfin API
        // keys are not bound to a user, so /Sessions/Current only works when a
        // client is actively streaming. Fall back to the live lookup so older
        // installations (pre-adminUserId) keep working.
        let jellyfinUserId = await getSetting("jellyfin.adminUserId");
        if (!jellyfinUserId) {
          jellyfinUserId = await jellyfin.getCurrentUserId(url, apiKey);
        }
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
        const result = await plex.authenticateServerToken(url, plexToken);
        if (!result.ok || !result.userId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not validate Plex admin token",
          });
        }
        token = plexToken;
        externalUserId = result.userId;
      }

      const existing = await repo.findByProvider(ctx.session.user.id, input.provider);

      let connectionId: string;
      if (existing) {
        await repo.update(existing.id, {
          token,
          refreshToken: null,
          tokenExpiresAt: null,
          externalUserId,
          staleReason: null,
        });
        connectionId = existing.id;
      } else {
        const inserted = await repo.create({
          userId: ctx.session.user.id,
          provider: input.provider,
          token,
          externalUserId,
        });
        connectionId = inserted.id;
      }

      void setupLibrariesForConnection(ctx.db, ctx.session.user.id, input.provider, connectionId);

      return { success: true, id: connectionId };
    }),
});
