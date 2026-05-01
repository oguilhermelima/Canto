import { TRPCError } from "@trpc/server";

import { toggleLibraryInput } from "@canto/validators";
import { getPlexCredentials } from "@canto/core/platform/secrets/server-credentials";
import { createTRPCRouter, adminProcedure } from "../trpc";
import { syncPlexLibraries } from "@canto/core/domain/media-servers/use-cases/sync-libraries/plex";
import { testPlexConnection, scanPlexLibrary, getPlexSections } from "@canto/core/infra/media-servers/plex.adapter";
import { updateFolder, findAllServerLinks } from "@canto/core/infra/file-organization/folder-repository";
import { makeFoldersRepository } from "@canto/core/infra/file-organization/folders-repository.adapter";

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const plexRouter = createTRPCRouter({
  /** Test connection and auto-sync libraries */
  testConnection: adminProcedure.query(async () => {
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
    return syncPlexLibraries(
      makeFoldersRepository(ctx.db),
      creds.url,
      creds.token,
      getPlexSections,
    );
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
