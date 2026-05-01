import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import { autoElectDefault } from "@canto/core/domain/media-servers/use-cases/shared/sync-helpers";
import type { SyncedLibraryEntry } from "@canto/core/domain/media-servers/use-cases/sync-libraries/jellyfin";

interface PlexSection {
  key: string;
  title: string;
  type: string;
  Location: Array<{ path: string }>;
}

/**
 * Sync Plex server sections → folder_server_link rows.
 * For each Plex section, upsert a link to track it for reverse-sync.
 */
export async function syncPlexLibraries(
  folders: FoldersRepositoryPort,
  url: string,
  token: string,
  getSections: (url: string, token: string) => Promise<PlexSection[]>,
): Promise<SyncedLibraryEntry[]> {
  const sections = await getSections(url, token);
  const synced: SyncedLibraryEntry[] = [];

  for (const section of sections) {
    if (!["movie", "show"].includes(section.type)) continue;

    const serverPath = section.Location[0]?.path ?? null;
    const contentType = section.type === "movie" ? "movies" : "shows";

    const existingLink = await folders.findServerLink("plex", section.key);

    const link = await folders.upsertServerLink({
      serverType: "plex",
      serverLibraryId: section.key,
      serverLibraryName: section.title,
      serverPath,
      contentType,
    });

    synced.push({
      id: link.id,
      name: section.title,
      action: existingLink ? "updated" : "created",
    });
  }

  await autoElectDefault(folders);
  return synced;
}
