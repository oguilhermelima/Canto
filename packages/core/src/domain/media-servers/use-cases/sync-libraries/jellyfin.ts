import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import { autoElectDefault } from "@canto/core/domain/media-servers/use-cases/shared/sync-helpers";

interface JellyfinFolder {
  Id: string;
  Name: string;
  CollectionType: string;
  Locations: string[];
}

export interface SyncedLibraryEntry {
  id: string;
  name: string;
  action: "created" | "updated";
}

/**
 * Sync Jellyfin server libraries → folder_server_link rows.
 * For each Jellyfin library, upsert a link to track it for reverse-sync.
 */
export async function syncJellyfinLibraries(
  folders: FoldersRepositoryPort,
  url: string,
  apiKey: string,
  getLibraryFolders: (url: string, apiKey: string) => Promise<JellyfinFolder[]>,
): Promise<SyncedLibraryEntry[]> {
  const remoteFolders = await getLibraryFolders(url, apiKey);
  const synced: SyncedLibraryEntry[] = [];

  for (const folder of remoteFolders) {
    if (!["movies", "tvshows"].includes(folder.CollectionType)) continue;

    const serverPath = folder.Locations[0] ?? null;
    const contentType = folder.CollectionType === "movies" ? "movies" : "shows";

    const existingLink = await folders.findServerLink("jellyfin", folder.Id);

    const link = await folders.upsertServerLink({
      serverType: "jellyfin",
      serverLibraryId: folder.Id,
      serverLibraryName: folder.Name,
      serverPath,
      contentType,
    });

    synced.push({
      id: link.id,
      name: folder.Name,
      action: existingLink ? "updated" : "created",
    });
  }

  await autoElectDefault(folders);
  return synced;
}
