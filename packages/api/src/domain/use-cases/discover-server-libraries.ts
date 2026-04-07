import type { Database } from "@canto/db/client";
import { getJellyfinCredentials, getPlexCredentials } from "../../lib/server-credentials";
import { getJellyfinLibraryFolders } from "../../infrastructure/adapters/jellyfin";
import { getPlexSections } from "../../infrastructure/adapters/plex";
import { findAllServerLinks } from "../../infrastructure/repositories/folder-repository";

type DiscoveredLibrary = {
  serverType: string;
  serverLibraryId: string;
  serverLibraryName: string;
  contentType: string;
  serverPath: string | null;
  linkId?: string;
  syncEnabled: boolean;
  lastSyncedAt: Date | null;
};

/**
 * Discover server libraries and their link status.
 * Fetches libraries from the server and joins with existing folder_server_link rows.
 */
export async function discoverServerLibraries(
  db: Database,
  serverType: "jellyfin" | "plex",
): Promise<DiscoveredLibrary[]> {
  let serverLibraries: Array<{
    id: string; name: string; contentType: string; path: string | null;
  }>;

  if (serverType === "jellyfin") {
    const creds = await getJellyfinCredentials();
    if (!creds) return [];
    const folders = await getJellyfinLibraryFolders(creds.url, creds.apiKey);
    serverLibraries = folders.map((f) => ({
      id: f.Id, name: f.Name,
      contentType: f.CollectionType === "movies" ? "movies" : "shows",
      path: f.Locations[0] ?? null,
    }));
  } else {
    const creds = await getPlexCredentials();
    if (!creds) return [];
    const sections = await getPlexSections(creds.url, creds.token);
    serverLibraries = sections.map((s) => ({
      id: s.key, name: s.title,
      contentType: s.type === "movie" ? "movies" : "shows",
      path: s.Location[0]?.path ?? null,
    }));
  }

  const existingLinks = await findAllServerLinks(db, serverType);
  const linkMap = new Map(existingLinks.map((l) => [l.serverLibraryId, l]));

  return serverLibraries.map((lib) => {
    const link = linkMap.get(lib.id);
    return {
      serverType,
      serverLibraryId: lib.id,
      serverLibraryName: lib.name,
      contentType: link?.contentType ?? lib.contentType,
      serverPath: lib.path,
      linkId: link?.id,
      syncEnabled: link?.syncEnabled ?? false,
      lastSyncedAt: link?.lastSyncedAt ?? null,
    };
  });
}
