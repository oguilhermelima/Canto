import { TRPCError } from "@trpc/server";
import { getSetting } from "@canto/db/settings";
import { traktDeviceCheckInput, checkPlexPinInput } from "@canto/validators";
import {
  checkPlexPin,
  createPlexPin,
  completeTraktDeviceAuth,
  startTraktDeviceAuth,
} from "@canto/core/domain/media-servers/use-cases/authenticate";
import { TraktConfigurationError, TraktHttpError } from "@canto/core/infra/trakt/trakt-shim";
import { makeTraktApi } from "@canto/core/infra/trakt/trakt-api.adapter-bindings";
import { makePlexAdapter } from "@canto/core/infra/media-servers/plex.adapter-bindings";
import { makeUserConnectionRepository } from "@canto/core/infra/media-servers/user-connection-repository.adapter";
import { dispatchUserTraktSync } from "@canto/core/platform/queue/bullmq-dispatcher";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { setupLibrariesForConnection } from "./setup";

export const oauthRouter = createTRPCRouter({
  plexPinCreate: protectedProcedure.mutation(() =>
    createPlexPin({ plex: makePlexAdapter() }),
  ),

  plexPinCheck: protectedProcedure
    .input(checkPlexPinInput)
    .query(async ({ ctx, input }) => {
      const repo = makeUserConnectionRepository(ctx.db);
      const plex = makePlexAdapter();

      const serverUrl = input.serverUrl ?? (await getSetting("plex.url")) ?? undefined;
      const result = await checkPlexPin(
        {
          pinId: input.pinId,
          clientId: input.clientId,
          serverUrl,
        },
        { plex },
      );

      if (result.authenticated && result.token) {
        const existing = await repo.findByProvider(ctx.session.user.id, "plex");

        let connectionId: string;

        if (existing) {
          await repo.update(existing.id, {
            token: result.token,
            externalUserId: result.userId ?? existing.externalUserId,
          });
          connectionId = existing.id;
        } else {
          const inserted = await repo.create({
            userId: ctx.session.user.id,
            provider: "plex",
            token: result.token,
            externalUserId: result.userId ?? "unknown",
          });
          connectionId = inserted.id;
        }

        void setupLibrariesForConnection(ctx.db, ctx.session.user.id, "plex", connectionId);
      }

      return result;
    }),

  traktDeviceCreate: protectedProcedure.mutation(async () => {
    try {
      return await startTraktDeviceAuth({ trakt: makeTraktApi() });
    } catch (err) {
      if (err instanceof TraktConfigurationError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
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
        return await completeTraktDeviceAuth(
          ctx.session.user.id,
          input.deviceCode,
          {
            trakt: makeTraktApi(),
            repo: makeUserConnectionRepository(ctx.db),
            dispatchUserTraktSync,
          },
        );
      } catch (err) {
        if (err instanceof TraktConfigurationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        if (err instanceof TraktHttpError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Trakt authentication failed",
        });
      }
    }),
});
