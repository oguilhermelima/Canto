import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { library } from "@canto/db/schema";

import { createTRPCRouter, publicProcedure } from "../trpc";

const JELLYFIN_URL = process.env.JELLYFIN_URL ?? "";
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY ?? "";

export const jellyfinRouter = createTRPCRouter({
  /** Test connection to Jellyfin */
  testConnection: publicProcedure.query(async () => {
    if (!JELLYFIN_URL || !JELLYFIN_API_KEY) {
      return {
        connected: false,
        error: "Jellyfin URL or API key not configured",
      };
    }
    try {
      const res = await fetch(`${JELLYFIN_URL}/System/Info`, {
        headers: { "X-Emby-Token": JELLYFIN_API_KEY },
      });
      if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
      const info = (await res.json()) as {
        ServerName: string;
        Version: string;
      };
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

  /** Sync libraries from Jellyfin */
  syncLibraries: publicProcedure.mutation(async ({ ctx }) => {
    if (!JELLYFIN_URL || !JELLYFIN_API_KEY) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Jellyfin not configured",
      });
    }

    const res = await fetch(`${JELLYFIN_URL}/Library/VirtualFolders`, {
      headers: { "X-Emby-Token": JELLYFIN_API_KEY },
    });
    if (!res.ok) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch Jellyfin libraries",
      });
    }

    const folders = (await res.json()) as Array<{
      ItemId: string;
      Name: string;
      CollectionType: string;
      Locations: string[];
    }>;

    const synced = [];
    for (const folder of folders) {
      // Map CollectionType to our type
      let type = "movies";
      if (folder.CollectionType === "tvshows") {
        // Check if name contains "anime" to distinguish
        type = /anime/i.test(folder.Name) ? "animes" : "shows";
      }

      // Map CollectionType to default qbitCategory
      const defaultCategory =
        type === "movies" ? "movies" : type === "animes" ? "animes" : "shows";

      // Check if we already have this library synced
      const existing = await ctx.db.query.library.findFirst({
        where: eq(library.jellyfinLibraryId, folder.ItemId),
      });

      if (existing) {
        // Update
        await ctx.db
          .update(library)
          .set({
            name: folder.Name,
            jellyfinPath: folder.Locations[0] ?? null,
            updatedAt: new Date(),
          })
          .where(eq(library.id, existing.id));
        synced.push({
          id: existing.id,
          name: folder.Name,
          action: "updated" as const,
        });
      } else {
        // Create
        const [row] = await ctx.db
          .insert(library)
          .values({
            name: folder.Name,
            type,
            jellyfinPath: folder.Locations[0] ?? null,
            jellyfinLibraryId: folder.ItemId,
            qbitCategory: defaultCategory,
            isDefault: false,
          })
          .returning();
        synced.push({
          id: row?.id,
          name: folder.Name,
          action: "created" as const,
        });
      }
    }

    return synced;
  }),

  /** Trigger library scan */
  scan: publicProcedure.mutation(async () => {
    if (!JELLYFIN_URL || !JELLYFIN_API_KEY) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Jellyfin not configured",
      });
    }
    await fetch(`${JELLYFIN_URL}/Library/Refresh`, {
      method: "POST",
      headers: { "X-Emby-Token": JELLYFIN_API_KEY },
    });
    return { success: true };
  }),

  /** Merge versions of a media item in Jellyfin */
  mergeVersions: publicProcedure
    .input(z.object({ jellyfinItemIds: z.array(z.string()).min(2) }))
    .mutation(async ({ input }) => {
      if (!JELLYFIN_URL || !JELLYFIN_API_KEY) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Jellyfin not configured",
        });
      }
      const ids = input.jellyfinItemIds.join(",");
      const res = await fetch(
        `${JELLYFIN_URL}/Videos/MergeVersions?Ids=${ids}`,
        {
          method: "POST",
          headers: { "X-Emby-Token": JELLYFIN_API_KEY },
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
