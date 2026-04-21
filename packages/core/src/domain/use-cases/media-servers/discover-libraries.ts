import { eq, and } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { userConnection } from "@canto/db/schema";
import { getJellyfinCredentials, getPlexCredentials } from "../../../lib/server-credentials";
import { getJellyfinLibraryFolders } from "../../../infrastructure/adapters/media-servers/jellyfin";
import { getPlexSections } from "../../../infrastructure/adapters/media-servers/plex";
import { findAllServerLinks } from "../../../infrastructure/repositories/file-organization/folder";

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
  userId?: string,
): Promise<DiscoveredLibrary[]> {
  let serverLibraries: Array<{
    id: string; name: string; contentType: string; path: string | null;
  }> = [];

  let url: string | null = null;
  let token: string | null = null;
  let userConnId: string | undefined;

  if (userId) {
    const conn = await db.query.userConnection.findFirst({
      where: and(
        eq(userConnection.userId, userId),
        eq(userConnection.provider, serverType),
      ),
    });
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
    const folders = await getJellyfinLibraryFolders(url, token);
    serverLibraries = folders.map((f) => ({
      id: f.Id, name: f.Name,
      contentType: f.CollectionType === "movies" ? "movies" : "shows",
      path: f.Locations[0] ?? null,
    }));
  } else {
    const sections = await getPlexSections(url, token);
    serverLibraries = sections.map((s) => ({
      id: s.key, name: s.title,
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
