import type { Database } from "@canto/db/client";

import {
  findServerLink,
  upsertServerLink,
} from "../../../../infrastructure/repositories";
import { autoElectDefault } from "../shared/sync-helpers";

type PlexSection = { key: string; title: string; type: string; Location: Array<{ path: string }> };

/**
 * Sync Plex server sections → folder_server_link rows.
 * For each Plex section, upsert a link to track it for reverse-sync.
 */
export async function syncPlexLibraries(
  db: Database,
  url: string,
  token: string,
  getSections: (url: string, token: string) => Promise<PlexSection[]>,
): Promise<Array<{ id: string; name: string; action: "created" | "updated" }>> {
  const sections = await getSections(url, token);
  const synced: Array<{ id: string; name: string; action: "created" | "updated" }> = [];

  for (const section of sections) {
    if (!["movie", "show"].includes(section.type)) continue;

    const serverPath = section.Location[0]?.path ?? null;
    const contentType = section.type === "movie" ? "movies" : "shows";

    const existingLink = await findServerLink(db, "plex", section.key);

    const link = await upsertServerLink(db, {
      serverType: "plex",
      serverLibraryId: section.key,
      serverLibraryName: section.title,
      serverPath,
      contentType,
    });

    synced.push({
      id: link!.id,
      name: section.title,
      action: existingLink ? "updated" : "created",
    });
  }

  await autoElectDefault(db);
  return synced;
}
