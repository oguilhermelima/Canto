import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { userConnection } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";
import { traktDeviceCheckInput, checkPlexPinInput } from "@canto/validators";
import {
  checkPlexPin,
  createPlexPin,
  completeTraktDeviceAuth,
  startTraktDeviceAuth,
} from "@canto/core/domain/use-cases/authenticate-media-server";
import { TraktConfigurationError, TraktHttpError } from "@canto/core/infrastructure/adapters/trakt";
import { dispatchUserTraktSync } from "@canto/core/infrastructure/queue/bullmq-dispatcher";
import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { setupLibrariesForConnection } from "./setup";

export const oauthRouter = createTRPCRouter({
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
      return await startTraktDeviceAuth();
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
        return await completeTraktDeviceAuth(ctx.db, ctx.session.user.id, input.deviceCode, {
          dispatchUserTraktSync,
        });
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
