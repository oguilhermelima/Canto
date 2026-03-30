import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getPlexCredentials } from "../lib/server-credentials";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { syncPlexLibraries } from "../domain/use-cases/sync-plex-libraries";
import { testPlexConnection, scanPlexLibrary } from "../infrastructure/adapters/plex";
import { findAllLibraries, updateLibrary } from "../infrastructure/repositories/library-repository";

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const plexRouter = createTRPCRouter({
  /** Test connection and auto-sync libraries */
  testConnection: publicProcedure.query(async ({ ctx }) => {
    const creds = await getPlexCredentials();
    if (!creds) return { connected: false, error: "Plex URL or token not configured" };

    try {
      const info = await testPlexConnection(creds.url, creds.token);
      await syncPlexLibraries(ctx.db, creds.url, creds.token);
      return { connected: true, serverName: info.serverName, version: info.version };
    } catch (err) {
      return { connected: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }),

  /** Manual re-sync of libraries from Plex */
  syncLibraries: publicProcedure.mutation(async ({ ctx }) => {
    const creds = await getPlexCredentials();
    if (!creds) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Plex not configured",
      });
    }
    return syncPlexLibraries(ctx.db, creds.url, creds.token);
  }),

  scan: publicProcedure.mutation(async ({ ctx }) => {
    const creds = await getPlexCredentials();
    if (!creds) throw new TRPCError({ code: "BAD_REQUEST", message: "Plex not configured" });

    const libs = await findAllLibraries(ctx.db);
    const sectionIds = libs.filter((l) => l.plexLibraryId).map((l) => l.plexLibraryId!);
    await scanPlexLibrary(creds.url, creds.token, sectionIds.length > 0 ? sectionIds : undefined);
    return { success: true };
  }),

  toggleLibrary: publicProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(({ ctx, input }) => updateLibrary(ctx.db, input.id, { enabled: input.enabled })),
});
