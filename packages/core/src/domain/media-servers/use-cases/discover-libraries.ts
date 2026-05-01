import type { FoldersRepositoryPort } from "@canto/core/domain/file-organization/ports/folders-repository.port";
import type { JellyfinAdapterPort } from "@canto/core/domain/media-servers/ports/jellyfin-adapter.port";
import type { PlexAdapterPort } from "@canto/core/domain/media-servers/ports/plex-adapter.port";
import type { ServerCredentialsPort } from "@canto/core/domain/media-servers/ports/server-credentials.port";
import type { UserConnectionRepositoryPort } from "@canto/core/domain/media-servers/ports/user-connection-repository.port";

export interface DiscoveredLibrary {
  serverType: string;
  serverLibraryId: string;
  serverLibraryName: string;
  contentType: string;
  serverPath: string | null;
  linkId?: string;
  syncEnabled: boolean;
  lastSyncedAt: Date | null;
}

export interface DiscoverServerLibrariesDeps {
  repo: UserConnectionRepositoryPort;
  folders: FoldersRepositoryPort;
  credentials: ServerCredentialsPort;
  plex: PlexAdapterPort;
  jellyfin: JellyfinAdapterPort;
}

interface ResolvedServerCreds {
  url: string;
  token: string;
  userConnectionId?: string;
}

async function resolveServerCreds(
  serverType: "jellyfin" | "plex",
  deps: DiscoverServerLibrariesDeps,
  userId: string | undefined,
): Promise<ResolvedServerCreds | null> {
  if (userId) {
    const conn = await deps.repo.findByProvider(userId, serverType);
    if (!conn?.token) return null;
    if (serverType === "jellyfin") {
      const creds = await deps.credentials.getJellyfin();
      return creds ? { url: creds.url, token: conn.token, userConnectionId: conn.id } : null;
    }
    const creds = await deps.credentials.getPlex();
    return creds ? { url: creds.url, token: conn.token, userConnectionId: conn.id } : null;
  }

  if (serverType === "jellyfin") {
    const creds = await deps.credentials.getJellyfin();
    return creds ? { url: creds.url, token: creds.apiKey } : null;
  }
  const creds = await deps.credentials.getPlex();
  return creds ? { url: creds.url, token: creds.token } : null;
}

/**
 * Discover server libraries and their link status.
 * Fetches libraries from the server and joins with existing folder_server_link rows.
 */
export async function discoverServerLibraries(
  serverType: "jellyfin" | "plex",
  deps: DiscoverServerLibrariesDeps,
  userId?: string,
): Promise<DiscoveredLibrary[]> {
  const creds = await resolveServerCreds(serverType, deps, userId);
  if (!creds) return [];

  let serverLibraries: Array<{
    id: string;
    name: string;
    contentType: string;
    path: string | null;
  }>;

  if (serverType === "jellyfin") {
    const folders = await deps.jellyfin.getLibraryFolders(creds.url, creds.token);
    serverLibraries = folders.map((f) => ({
      id: f.Id,
      name: f.Name,
      contentType: f.CollectionType === "movies" ? "movies" : "shows",
      path: f.Locations[0] ?? null,
    }));
  } else {
    const sections = await deps.plex.getSections(creds.url, creds.token);
    serverLibraries = sections.map((s) => ({
      id: s.key,
      name: s.title,
      contentType: s.type === "movie" ? "movies" : "shows",
      path: s.Location[0]?.path ?? null,
    }));
  }

  const existingLinks = await deps.folders.findAllServerLinks(
    serverType,
    creds.userConnectionId,
  );
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
