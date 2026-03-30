import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@canto/db/client";
import { library } from "@canto/db/schema";

import { getPlexCredentials } from "../lib/server-credentials";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { syncPlexLibraries } from "../domain/use-cases/sync-plex-libraries";

async function plexFetch<T>(
  url: string,
  token: string,
  endpoint: string,
): Promise<T> {
  const res = await fetch(`${url}${endpoint}?X-Plex-Token=${token}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Plex API error: ${res.status}`,
    });
  }
  return res.json() as Promise<T>;
}

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const plexRouter = createTRPCRouter({
  /** Test connection and auto-sync libraries */
  testConnection: publicProcedure.query(async ({ ctx }) => {
    const creds = await getPlexCredentials();
    if (!creds) {
      return { connected: false, error: "Plex URL or token not configured" };
    }

    try {
      const data = await plexFetch<{
        MediaContainer: { friendlyName: string; version: string };
      }>(creds.url, creds.token, "/");

      // Auto-sync libraries on successful connection
      await syncPlexLibraries(ctx.db, creds.url, creds.token);

      return {
        connected: true,
        serverName: data.MediaContainer.friendlyName,
        version: data.MediaContainer.version,
      };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
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

  /** Trigger library scan for all linked Plex libraries */
  scan: publicProcedure.mutation(async ({ ctx }) => {
    const creds = await getPlexCredentials();
    if (!creds) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Plex not configured",
      });
    }

    // Scan each linked library individually for targeted refresh
    const linkedLibs = await ctx.db.query.library.findMany();
    const linked = linkedLibs.filter((l) => l.plexLibraryId);

    if (linked.length === 0) {
      // No linked libraries, scan all
      await fetch(
        `${creds.url}/library/sections/all/refresh?X-Plex-Token=${creds.token}`,
      );
    } else {
      await Promise.all(
        linked.map((lib) =>
          fetch(
            `${creds.url}/library/sections/${lib.plexLibraryId}/refresh?X-Plex-Token=${creds.token}`,
          ).catch(() => {}),
        ),
      );
    }

    return { success: true };
  }),

  /** Toggle a library's Plex link */
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
});

/* -------------------------------------------------------------------------- */
/*  Shared sync logic                                                         */
/* syncPlexLibraries moved to domain/use-cases/sync-plex-libraries.ts */
