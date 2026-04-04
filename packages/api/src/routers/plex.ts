import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getPlexCredentials } from "../lib/server-credentials";
import { createTRPCRouter, adminProcedure } from "../trpc";
import { syncPlexLibraries } from "../domain/use-cases/sync-plex-libraries";
import { testPlexConnection, scanPlexLibrary, getPlexSections } from "../infrastructure/adapters/plex";
import { updateFolder, findAllServerLinks } from "../infrastructure/repositories/folder-repository";

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const plexRouter = createTRPCRouter({
  /** Test connection and auto-sync libraries */
  testConnection: adminProcedure.query(async ({ ctx }) => {
    const creds = await getPlexCredentials();
    if (!creds) return { connected: false, error: "Plex URL or token not configured" };

    try {
      const info = await testPlexConnection(creds.url, creds.token);
      await syncPlexLibraries(ctx.db, creds.url, creds.token, getPlexSections);
      return { connected: true, serverName: info.serverName, version: info.version };
    } catch (err) {
      return { connected: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }),

  /** Manual re-sync of libraries from Plex */
  syncLibraries: adminProcedure.mutation(async ({ ctx }) => {
    const creds = await getPlexCredentials();
    if (!creds) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Plex not configured",
      });
    }
    return syncPlexLibraries(ctx.db, creds.url, creds.token, getPlexSections);
  }),

  scan: adminProcedure.mutation(async ({ ctx }) => {
    const creds = await getPlexCredentials();
    if (!creds) throw new TRPCError({ code: "BAD_REQUEST", message: "Plex not configured" });

    const plexLinks = await findAllServerLinks(ctx.db, "plex");
    const sectionIds = plexLinks.map((l) => l.serverLibraryId);
    await scanPlexLibrary(creds.url, creds.token, sectionIds.length > 0 ? sectionIds : undefined);
    return { success: true };
  }),

  toggleLibrary: adminProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(({ ctx, input }) => updateFolder(ctx.db, input.id, { enabled: input.enabled })),
});
