import type { Database } from "@canto/db/client";

import {
  findAllFolders,
  findServerLink,
  upsertServerLink,
  addMediaPath,
} from "../../infrastructure/repositories";
import { autoElectDefault } from "./sync-library-helpers";

type JellyfinFolder = { Id: string; Name: string; CollectionType: string; Locations: string[] };

/**
 * Sync Jellyfin server libraries → folder_server_link junction.
 * For each Jellyfin library, find or create a matching link.
 * When no folder matches by name, create an unlinked link (folderId: null).
 * When a folder IS linked, auto-add server path as a media path.
 */
export async function syncJellyfinLibraries(
  db: Database,
  url: string,
  apiKey: string,
  getLibraryFolders: (url: string, apiKey: string) => Promise<JellyfinFolder[]>,
): Promise<Array<{ id: string; name: string; action: "linked" | "created" | "unlinked" }>> {
  const folders = await getLibraryFolders(url, apiKey);

  const synced: Array<{ id: string; name: string; action: "linked" | "created" | "unlinked" }> = [];

  for (const folder of folders) {
    if (!["movies", "tvshows"].includes(folder.CollectionType)) continue;

    const serverPath = folder.Locations[0] ?? null;
    const contentType = folder.CollectionType === "movies" ? "movies" : "shows";

    // Check if already linked
    const existingLink = await findServerLink(db, "jellyfin", folder.Id);
    if (existingLink) {
      // Update name/path, preserve existing folderId
      await upsertServerLink(db, {
        folderId: existingLink.folderId,
        serverType: "jellyfin",
        serverLibraryId: folder.Id,
        serverLibraryName: folder.Name,
        serverPath,
        contentType,
      });

      // Auto-add server path to media paths when folder is linked
      if (existingLink.folderId && serverPath) {
        await addMediaPath(db, {
          folderId: existingLink.folderId,
          path: serverPath,
          label: "Jellyfin",
          source: "jellyfin",
        });
      }

      synced.push({ id: existingLink.id, name: folder.Name, action: "linked" });
      continue;
    }

    // Try to find a matching download folder by name
    const allFolders = await findAllFolders(db);
    const match = allFolders.find((f) => f.name.toLowerCase() === folder.Name.toLowerCase());

    if (match) {
      // Link to existing folder
      const link = await upsertServerLink(db, {
        folderId: match.id,
        serverType: "jellyfin",
        serverLibraryId: folder.Id,
        serverLibraryName: folder.Name,
        serverPath,
        contentType,
      });

      // Auto-add server path as a media path
      if (serverPath) {
        await addMediaPath(db, {
          folderId: match.id,
          path: serverPath,
          label: "Jellyfin",
          source: "jellyfin",
        });
      }

      synced.push({ id: link!.id, name: folder.Name, action: "linked" });
    } else {
      // No matching folder — create unlinked link (folderId: null)
      const link = await upsertServerLink(db, {
        folderId: null,
        serverType: "jellyfin",
        serverLibraryId: folder.Id,
        serverLibraryName: folder.Name,
        serverPath,
        contentType,
      });
      synced.push({ id: link!.id, name: folder.Name, action: "unlinked" });
    }
  }

  await autoElectDefault(db);
  return synced;
}
