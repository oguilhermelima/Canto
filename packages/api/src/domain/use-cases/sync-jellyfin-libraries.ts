import { eq } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import { library } from "@canto/db/schema";

import { autoElectDefaults } from "./sync-library-helpers";

export async function syncJellyfinLibraries(
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

    let existing = await db.query.library.findFirst({
      where: eq(library.jellyfinLibraryId, folder.ItemId),
    });

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

  await autoElectDefaults(db);
  return synced;
}
