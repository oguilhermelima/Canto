import type { Database } from "@canto/db/client";

import {
  findAllFolders,
  createFolder,
  findServerLink,
  upsertServerLink,
} from "../../infrastructure/repositories";
import { autoElectDefault } from "./sync-library-helpers";

type PlexSection = { key: string; title: string; type: string; Location: Array<{ path: string }> };

/**
 * Sync Plex server sections → folder_server_link junction.
 * For each Plex section, find or create a matching download folder and link it.
 */
export async function syncPlexLibraries(
  db: Database,
  url: string,
  token: string,
  getSections: (url: string, token: string) => Promise<PlexSection[]>,
): Promise<Array<{ id: string; name: string; action: "linked" | "created" }>> {
  const sections = await getSections(url, token);
  const synced: Array<{ id: string; name: string; action: "linked" | "created" }> = [];

  for (const section of sections) {
    if (!["movie", "show"].includes(section.type)) continue;

    const serverPath = section.Location[0]?.path ?? null;
    const contentType = section.type === "movie" ? "movies" : "shows";

    // Check if already linked
    const existingLink = await findServerLink(db, "plex", section.key);
    if (existingLink) {
      await upsertServerLink(db, {
        folderId: existingLink.folderId,
        serverType: "plex",
        serverLibraryId: section.key,
        serverLibraryName: section.title,
        serverPath,
        contentType,
      });
      synced.push({ id: existingLink.folderId, name: section.title, action: "linked" });
      continue;
    }

    // Try to find a matching download folder by name
    const allFolders = await findAllFolders(db);
    const match = allFolders.find((f) => f.name.toLowerCase() === section.title.toLowerCase());

    if (match) {
      await upsertServerLink(db, {
        folderId: match.id,
        serverType: "plex",
        serverLibraryId: section.key,
        serverLibraryName: section.title,
        serverPath,
        contentType,
      });
      synced.push({ id: match.id, name: section.title, action: "linked" });
    } else {
      const isAnime = /anime/i.test(section.title);
      const qbitCategory = section.type === "movie" ? "movies" : isAnime ? "animes" : "shows";

      const newFolder = await createFolder(db, {
        name: section.title,
        libraryPath: serverPath,
        qbitCategory,
        isDefault: false,
        enabled: true,
      });

      if (newFolder) {
        await upsertServerLink(db, {
          folderId: newFolder.id,
          serverType: "plex",
          serverLibraryId: section.key,
          serverLibraryName: section.title,
          serverPath,
          contentType,
        });
        synced.push({ id: newFolder.id, name: section.title, action: "created" });
      }
    }
  }

  await autoElectDefault(db);
  return synced;
}
