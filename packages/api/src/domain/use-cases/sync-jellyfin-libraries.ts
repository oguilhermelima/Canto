import type { Database } from "@canto/db/client";

import {
  findLibraryByJellyfinId,
  findLibrariesByType,
  updateLibrary,
  createLibrary,
} from "../../infrastructure/repositories";
import { getJellyfinLibraryFolders } from "../../infrastructure/adapters/jellyfin";
import { autoElectDefaults } from "./sync-library-helpers";

export async function syncJellyfinLibraries(
  db: Database,
  url: string,
  apiKey: string,
): Promise<Array<{ id: string; name: string; action: "created" | "updated" }>> {
  let folders: Array<{ Id: string; Name: string; CollectionType: string; Locations: string[] }>;
  try {
    folders = await getJellyfinLibraryFolders(url, apiKey);
  } catch {
    return [];
  }

  const synced: Array<{ id: string; name: string; action: "created" | "updated" }> = [];

  for (const folder of folders) {
    if (!["movies", "tvshows"].includes(folder.CollectionType)) continue;

    let type = "movies";
    if (folder.CollectionType === "tvshows") {
      type = /anime/i.test(folder.Name) ? "animes" : "shows";
    }

    const defaultCategory =
      type === "movies" ? "movies" : type === "animes" ? "animes" : "shows";

    let existing = await findLibraryByJellyfinId(db, folder.Id);

    if (!existing) {
      const allOfType = await findLibrariesByType(db, type);
      existing = allOfType.find((l) => !l.jellyfinLibraryId) ?? undefined;
    }

    if (existing) {
      await updateLibrary(db, existing.id, {
        name: folder.Name,
        jellyfinPath: folder.Locations[0] ?? null,
        jellyfinLibraryId: folder.Id,
      });
      synced.push({ id: existing.id, name: folder.Name, action: "updated" });
    } else {
      const row = await createLibrary(db, {
        name: folder.Name,
        type,
        jellyfinPath: folder.Locations[0] ?? null,
        jellyfinLibraryId: folder.Id,
        qbitCategory: defaultCategory,
        isDefault: false,
        enabled: true,
      });
      if (row) {
        synced.push({ id: row.id, name: folder.Name, action: "created" });
      }
    }
  }

  await autoElectDefaults(db);
  return synced;
}
