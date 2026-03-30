import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@canto/db/client";
import { library } from "@canto/db/schema";

import { getJellyfinCredentials } from "../lib/server-credentials";
import { createTRPCRouter, publicProcedure } from "../trpc";

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

/* -------------------------------------------------------------------------- */
/*  Shared sync logic                                                         */
/* -------------------------------------------------------------------------- */

async function syncJellyfinLibraries(
  db: Database,
  url: string,
  apiKey: string,
): Promise<Array<{ id: string; name: string; action: "created" | "updated" }>> {
  const res = await fetch(`${url}/Library/VirtualFolders`, {
    headers: { "X-Emby-Token": apiKey },
  });
  if (!res.ok) return [];

  const folders = (await res.json()) as Array<{
    ItemId: string;
    Name: string;
    CollectionType: string;
    Locations: string[];
  }>;

  const synced: Array<{ id: string; name: string; action: "created" | "updated" }> = [];

  for (const folder of folders) {
    if (!["movies", "tvshows"].includes(folder.CollectionType)) continue;

    let type = "movies";
    if (folder.CollectionType === "tvshows") {
      type = /anime/i.test(folder.Name) ? "animes" : "shows";
    }

    const defaultCategory =
      type === "movies" ? "movies" : type === "animes" ? "animes" : "shows";

    // Try by jellyfinLibraryId first
    let existing = await db.query.library.findFirst({
      where: eq(library.jellyfinLibraryId, folder.ItemId),
    });

    // Fallback: match unlinked library of same type
    if (!existing) {
      const allOfType = await db.query.library.findMany({
        where: eq(library.type, type),
      });
      existing = allOfType.find((l) => !l.jellyfinLibraryId) ?? undefined;
    }

    if (existing) {
      await db
        .update(library)
        .set({
          name: folder.Name,
          jellyfinPath: folder.Locations[0] ?? null,
          jellyfinLibraryId: folder.ItemId,
          updatedAt: new Date(),
        })
        .where(eq(library.id, existing.id));
      synced.push({ id: existing.id, name: folder.Name, action: "updated" });
    } else {
      const [row] = await db
        .insert(library)
        .values({
          name: folder.Name,
          type,
          jellyfinPath: folder.Locations[0] ?? null,
          jellyfinLibraryId: folder.ItemId,
          qbitCategory: defaultCategory,
          isDefault: false,
          enabled: true,
        })
        .returning();
      if (row) {
        synced.push({ id: row.id, name: folder.Name, action: "created" });
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
