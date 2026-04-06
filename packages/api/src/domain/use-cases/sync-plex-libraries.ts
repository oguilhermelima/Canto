import type { Database } from "@canto/db/client";

import {
  findAllFolders,
  findServerLink,
  upsertServerLink,
  addMediaPath,
} from "../../infrastructure/repositories";
import { autoElectDefault } from "./sync-library-helpers";

type PlexSection = { key: string; title: string; type: string; Location: Array<{ path: string }> };

/**
 * Sync Plex server sections → folder_server_link junction.
 * For each Plex section, find or create a matching link.
 * When no folder matches by name, create an unlinked link (folderId: null).
 * When a folder IS linked, auto-add server path as a media path.
 */
export async function syncPlexLibraries(
  db: Database,
  url: string,
  token: string,
  getSections: (url: string, token: string) => Promise<PlexSection[]>,
): Promise<Array<{ id: string; name: string; action: "linked" | "created" | "unlinked" }>> {
  const sections = await getSections(url, token);
  const synced: Array<{ id: string; name: string; action: "linked" | "created" | "unlinked" }> = [];

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

      // Auto-add server path to media paths when folder is linked
      if (existingLink.folderId && serverPath) {
        await addMediaPath(db, {
          folderId: existingLink.folderId,
          path: serverPath,
          label: "Plex",
          source: "plex",
        });
      }

      synced.push({ id: existingLink.id, name: section.title, action: "linked" });
      continue;
    }

    // Try to find a matching download folder by name
    const allFolders = await findAllFolders(db);
    const match = allFolders.find((f) => f.name.toLowerCase() === section.title.toLowerCase());

    if (match) {
      const link = await upsertServerLink(db, {
        folderId: match.id,
        serverType: "plex",
        serverLibraryId: section.key,
        serverLibraryName: section.title,
        serverPath,
        contentType,
      });

      // Auto-add server path as a media path
      if (serverPath) {
        await addMediaPath(db, {
          folderId: match.id,
          path: serverPath,
          label: "Plex",
          source: "plex",
        });
      }

      synced.push({ id: link!.id, name: section.title, action: "linked" });
    } else {
      // No matching folder — create unlinked link (folderId: null)
      const link = await upsertServerLink(db, {
        folderId: null,
        serverType: "plex",
        serverLibraryId: section.key,
        serverLibraryName: section.title,
        serverPath,
        contentType,
      });
      synced.push({ id: link!.id, name: section.title, action: "unlinked" });
    }
  }

  await autoElectDefault(db);
  return synced;
}
