import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@canto/db/client";
import { library } from "@canto/db/schema";
import { getSetting } from "@canto/db/settings";

import { createTRPCRouter, publicProcedure } from "../trpc";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function getPlexCredentials(): Promise<{
  url: string;
  token: string;
} | null> {
  const url = await getSetting("plex.url");
  const token = await getSetting("plex.token");
  if (!url || !token) return null;
  return { url, token };
}

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
/* -------------------------------------------------------------------------- */

interface PlexSection {
  key: string;
  title: string;
  type: string; // "movie" | "show" | "artist" | "photo"
  Location: Array<{ path: string }>;
}

async function syncPlexLibraries(
  db: Database,
  url: string,
  token: string,
): Promise<Array<{ id: string; name: string; action: "created" | "updated" }>> {
  const data = await plexFetch<{
    MediaContainer: { Directory: PlexSection[] };
  }>(url, token, "/library/sections");

  const sections = data.MediaContainer.Directory ?? [];
  const synced: Array<{ id: string; name: string; action: "created" | "updated" }> = [];

  for (const section of sections) {
    // Only sync movie and show libraries
    if (!["movie", "show"].includes(section.type)) continue;

    let type = "movies";
    if (section.type === "show") {
      type = /anime/i.test(section.title) ? "animes" : "shows";
    }

    // Try to find existing library by plexLibraryId
    let existing = await db.query.library.findFirst({
      where: eq(library.plexLibraryId, section.key),
    });

    // Fallback: match by type without any plex link
    if (!existing) {
      const allOfType = await db.query.library.findMany({
        where: eq(library.type, type),
      });
      existing = allOfType.find((l) => !l.plexLibraryId) ?? undefined;
    }

    if (existing) {
      await db
        .update(library)
        .set({
          plexLibraryId: section.key,
          updatedAt: new Date(),
        })
        .where(eq(library.id, existing.id));
      synced.push({ id: existing.id, name: section.title, action: "updated" });
    } else {
      const [row] = await db
        .insert(library)
        .values({
          name: section.title,
          type,
          mediaPath: section.Location[0]?.path ?? null,
          containerMediaPath: section.Location[0]?.path ?? null,
          qbitCategory: type === "movies" ? "movies" : type === "animes" ? "animes" : "shows",
          plexLibraryId: section.key,
          isDefault: false,
          enabled: true,
        })
        .returning();
      if (row) {
        synced.push({ id: row.id, name: section.title, action: "created" });
      }
    }
  }

  // Auto-elect defaults
  for (const t of ["movies", "shows", "animes"]) {
    const ofType = await db.query.library.findMany({
      where: eq(library.type, t),
    });
    if (ofType.length > 0 && !ofType.some((l) => l.isDefault)) {
      const first = ofType.find((l) => l.enabled) ?? ofType[0];
      if (first) {
        await db
          .update(library)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(library.id, first.id));
      }
    }
  }

  return synced;
}
