import { TRPCError } from "@trpc/server";

import { toggleLibraryInput, mergeJellyfinVersionsInput } from "@canto/validators";
import { getJellyfinCredentials } from "../lib/server-credentials";
import { createTRPCRouter, adminProcedure } from "../trpc";
import { syncJellyfinLibraries } from "../domain/use-cases/sync-jellyfin-libraries";
import {
  testJellyfinConnection,
  scanJellyfinLibrary,
  mergeJellyfinVersions,
  getJellyfinLibraryFolders,
} from "../infrastructure/adapters/jellyfin";
import { updateFolder } from "../infrastructure/repositories/folder-repository";

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const jellyfinRouter = createTRPCRouter({
  /** Test connection and auto-sync libraries when connected */
  testConnection: adminProcedure.query(async ({ ctx }) => {
    const creds = await getJellyfinCredentials();
    if (!creds) return { connected: false, error: "Jellyfin URL or API key not configured" };

    try {
      const info = await testJellyfinConnection(creds.url, creds.apiKey);
      return { connected: true, serverName: info.serverName, version: info.version };
    } catch (err) {
      return { connected: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }),

  /** Manual re-sync of libraries from Jellyfin */
  syncLibraries: adminProcedure.mutation(async ({ ctx }) => {
    const creds = await getJellyfinCredentials();
    if (!creds) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Jellyfin not configured",
      });
    }
    return syncJellyfinLibraries(ctx.db, creds.url, creds.apiKey, getJellyfinLibraryFolders);
  }),

  toggleLibrary: adminProcedure
    .input(toggleLibraryInput)
    .mutation(({ ctx, input }) => updateFolder(ctx.db, input.id, { enabled: input.enabled })),

  scan: adminProcedure.mutation(async () => {
    const creds = await getJellyfinCredentials();
    if (!creds) throw new TRPCError({ code: "BAD_REQUEST", message: "Jellyfin not configured" });
    await scanJellyfinLibrary(creds.url, creds.apiKey);
    return { success: true };
  }),

  mergeVersions: adminProcedure
    .input(mergeJellyfinVersionsInput)
    .mutation(async ({ input }) => {
      const creds = await getJellyfinCredentials();
      if (!creds) throw new TRPCError({ code: "BAD_REQUEST", message: "Jellyfin not configured" });
      await mergeJellyfinVersions(creds.url, creds.apiKey, input.jellyfinItemIds);
      return { success: true };
    }),
});
