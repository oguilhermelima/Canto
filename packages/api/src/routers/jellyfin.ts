import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@canto/db/client";
import { library } from "@canto/db/schema";

import { getJellyfinCredentials } from "../lib/server-credentials";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { syncJellyfinLibraries } from "../domain/use-cases/sync-jellyfin-libraries";

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const jellyfinRouter = createTRPCRouter({
  /** Test connection and auto-sync libraries when connected */
  testConnection: publicProcedure.query(async ({ ctx }) => {
    const creds = await getJellyfinCredentials();
    if (!creds) {
      return {
        connected: false,
        error: "Jellyfin URL or API key not configured",
      };
    }

    try {
      const res = await fetch(`${creds.url}/System/Info`, {
        headers: { "X-Emby-Token": creds.apiKey },
      });
      if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
      const info = (await res.json()) as {
        ServerName: string;
        Version: string;
      };

      // Auto-sync libraries on successful connection
      await syncJellyfinLibraries(ctx.db, creds.url, creds.apiKey);

      return {
        connected: true,
        serverName: info.ServerName,
        version: info.Version,
      };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }),

  /** Manual re-sync of libraries from Jellyfin */
  syncLibraries: publicProcedure.mutation(async ({ ctx }) => {
    const creds = await getJellyfinCredentials();
    if (!creds) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Jellyfin not configured",
      });
    }
    return syncJellyfinLibraries(ctx.db, creds.url, creds.apiKey);
  }),

  /** Toggle a library enabled/disabled */
  toggleLibrary: publicProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(library)
        .set({ enabled: input.enabled, updatedAt: new Date() })
        .where(eq(library.id, input.id))
        .returning();
      return updated;
    }),

  /** Trigger library scan */
  scan: publicProcedure.mutation(async () => {
    const creds = await getJellyfinCredentials();
    if (!creds) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Jellyfin not configured",
      });
    }
    await fetch(`${creds.url}/Library/Refresh`, {
      method: "POST",
      headers: { "X-Emby-Token": creds.apiKey },
    });
    return { success: true };
  }),

  /** Merge versions of a media item in Jellyfin */
  mergeVersions: publicProcedure
    .input(z.object({ jellyfinItemIds: z.array(z.string()).min(2) }))
    .mutation(async ({ input }) => {
      const creds = await getJellyfinCredentials();
      if (!creds) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Jellyfin not configured",
        });
      }
      const ids = input.jellyfinItemIds.join(",");
      const res = await fetch(
        `${creds.url}/Videos/MergeVersions?Ids=${ids}`,
        {
          method: "POST",
          headers: { "X-Emby-Token": creds.apiKey },
        },
      );
      if (!res.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Merge failed: ${res.status}`,
        });
      }
      return { success: true };
    }),
});

/* syncJellyfinLibraries moved to domain/use-cases/sync-jellyfin-libraries.ts */
