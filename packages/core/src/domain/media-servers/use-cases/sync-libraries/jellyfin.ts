import type { Database } from "@canto/db/client";

import {
  findServerLink,
  upsertServerLink,
} from "@canto/core/infra/repositories";
import { autoElectDefault } from "@canto/core/domain/media-servers/use-cases/shared/sync-helpers";

type JellyfinFolder = { Id: string; Name: string; CollectionType: string; Locations: string[] };

/**
 * Sync Jellyfin server libraries → folder_server_link rows.
 * For each Jellyfin library, upsert a link to track it for reverse-sync.
 */
export async function syncJellyfinLibraries(
  db: Database,
  url: string,
  apiKey: string,
  getLibraryFolders: (url: string, apiKey: string) => Promise<JellyfinFolder[]>,
): Promise<Array<{ id: string; name: string; action: "created" | "updated" }>> {
  const folders = await getLibraryFolders(url, apiKey);
  const synced: Array<{ id: string; name: string; action: "created" | "updated" }> = [];

  for (const folder of folders) {
    if (!["movies", "tvshows"].includes(folder.CollectionType)) continue;

    const serverPath = folder.Locations[0] ?? null;
    const contentType = folder.CollectionType === "movies" ? "movies" : "shows";

    const existingLink = await findServerLink(db, "jellyfin", folder.Id);

    const link = await upsertServerLink(db, {
      serverType: "jellyfin",
      serverLibraryId: folder.Id,
      serverLibraryName: folder.Name,
      serverPath,
      contentType,
    });

    synced.push({
      id: link!.id,
      name: folder.Name,
      action: existingLink ? "updated" : "created",
    });
  }

  await autoElectDefault(db);
  return synced;
}
