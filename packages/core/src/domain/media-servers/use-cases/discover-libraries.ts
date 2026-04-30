import type { Database } from "@canto/db/client";
import type { JellyfinAdapterPort } from "@canto/core/domain/media-servers/ports/jellyfin-adapter.port";
import type { PlexAdapterPort } from "@canto/core/domain/media-servers/ports/plex-adapter.port";
import type { UserConnectionRepositoryPort } from "@canto/core/domain/media-servers/ports/user-connection-repository.port";
import {
  getJellyfinCredentials,
  getPlexCredentials,
} from "@canto/core/platform/secrets/server-credentials";
import { findAllServerLinks } from "@canto/core/infra/file-organization/folder-repository";

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

export interface DiscoverServerLibrariesDeps {
  repo: UserConnectionRepositoryPort;
  plex: PlexAdapterPort;
  jellyfin: JellyfinAdapterPort;
}

/**
 * Discover server libraries and their link status.
 * Fetches libraries from the server and joins with existing folder_server_link rows.
 *
 * `db` is still required because folder_server_link is a file-organization
 * concern; it stays as a direct call until that wave runs.
 */
export async function discoverServerLibraries(
  db: Database,
  serverType: "jellyfin" | "plex",
  deps: DiscoverServerLibrariesDeps,
  userId?: string,
): Promise<DiscoveredLibrary[]> {
  let serverLibraries: Array<{
    id: string;
    name: string;
    contentType: string;
    path: string | null;
  }> = [];

  let url: string | null = null;
  let token: string | null = null;
  let userConnId: string | undefined;

  if (userId) {
    const conn = await deps.repo.findByProvider(userId, serverType);
    if (conn?.token) {
      userConnId = conn.id;
      token = conn.token;
      if (serverType === "jellyfin") {
        const creds = await getJellyfinCredentials();
        url = creds?.url ?? null;
      } else {
        const creds = await getPlexCredentials();
        url = creds?.url ?? null;
      }
    }
  } else {
    // Admin / Global mode
    if (serverType === "jellyfin") {
      const creds = await getJellyfinCredentials();
      url = creds?.url ?? null;
      token = creds?.apiKey ?? null;
    } else {
      const creds = await getPlexCredentials();
      url = creds?.url ?? null;
      token = creds?.token ?? null;
    }
  }

  if (!url || !token) return [];

  if (serverType === "jellyfin") {
    const folders = await deps.jellyfin.getLibraryFolders(url, token);
    serverLibraries = folders.map((f) => ({
      id: f.Id,
      name: f.Name,
      contentType: f.CollectionType === "movies" ? "movies" : "shows",
      path: f.Locations[0] ?? null,
    }));
  } else {
    const sections = await deps.plex.getSections(url, token);
    serverLibraries = sections.map((s) => ({
      id: s.key,
      name: s.title,
      contentType: s.type === "movie" ? "movies" : "shows",
      path: s.Location[0]?.path ?? null,
    }));
  }

  const existingLinks = await findAllServerLinks(db, serverType, userConnId);
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
