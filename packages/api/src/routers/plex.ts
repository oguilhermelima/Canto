import { TRPCError } from "@trpc/server";

import { toggleLibraryInput } from "@canto/validators";
import { getPlexCredentials } from "@canto/core/lib/server-credentials";
import { createTRPCRouter, adminProcedure } from "../trpc";
import { syncPlexLibraries } from "@canto/core/domain/use-cases/media-servers/sync-libraries/plex";
import { testPlexConnection, scanPlexLibrary, getPlexSections } from "@canto/core/infrastructure/adapters/media-servers/plex";
import { updateFolder, findAllServerLinks } from "@canto/core/infrastructure/repositories/file-organization/folder";

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
    .input(toggleLibraryInput)
    .mutation(({ ctx, input }) => updateFolder(ctx.db, input.id, { enabled: input.enabled })),
});
