import type { Database } from "@canto/db/client";

import {
  findAllFolders,
  createFolder,
  findServerLink,
  upsertServerLink,
} from "../../infrastructure/repositories";
import { autoElectDefault } from "./sync-library-helpers";

type JellyfinFolder = { Id: string; Name: string; CollectionType: string; Locations: string[] };

/**
 * Sync Jellyfin server libraries → folder_server_link junction.
 * For each Jellyfin library, find or create a matching download folder and link it.
 */
export async function syncJellyfinLibraries(
  db: Database,
  url: string,
  apiKey: string,
  getLibraryFolders: (url: string, apiKey: string) => Promise<JellyfinFolder[]>,
): Promise<Array<{ id: string; name: string; action: "linked" | "created" }>> {
  let folders: JellyfinFolder[];
  try {
    folders = await getLibraryFolders(url, apiKey);
  } catch {
    return [];
  }

  const synced: Array<{ id: string; name: string; action: "linked" | "created" }> = [];

  for (const folder of folders) {
    if (!["movies", "tvshows"].includes(folder.CollectionType)) continue;

    const serverPath = folder.Locations[0] ?? null;

    // Check if already linked
    const existingLink = await findServerLink(db, "jellyfin", folder.Id);
    if (existingLink) {
      // Update name/path
      await upsertServerLink(db, {
        folderId: existingLink.folderId,
        serverType: "jellyfin",
        serverLibraryId: folder.Id,
        serverLibraryName: folder.Name,
        serverPath,
      });
      synced.push({ id: existingLink.folderId, name: folder.Name, action: "linked" });
      continue;
    }

    // Try to find a matching download folder by name
    const allFolders = await findAllFolders(db);
    const match = allFolders.find((f) => f.name.toLowerCase() === folder.Name.toLowerCase());

    if (match) {
      // Link to existing folder
      await upsertServerLink(db, {
        folderId: match.id,
        serverType: "jellyfin",
        serverLibraryId: folder.Id,
        serverLibraryName: folder.Name,
        serverPath,
      });
      synced.push({ id: match.id, name: folder.Name, action: "linked" });
    } else {
      // Create new folder + link
      const isAnime = /anime/i.test(folder.Name);
      const qbitCategory = folder.CollectionType === "movies" ? "movies" : isAnime ? "animes" : "shows";

      const newFolder = await createFolder(db, {
        name: folder.Name,
        libraryPath: serverPath,
        qbitCategory,
        isDefault: false,
        enabled: true,
      });

      if (newFolder) {
        await upsertServerLink(db, {
          folderId: newFolder.id,
          serverType: "jellyfin",
          serverLibraryId: folder.Id,
          serverLibraryName: folder.Name,
          serverPath,
        });
        synced.push({ id: newFolder.id, name: folder.Name, action: "created" });
      }
    }
  }

  await autoElectDefault(db);
  return synced;
}
