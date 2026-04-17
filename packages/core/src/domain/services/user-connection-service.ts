import type { Database } from "@canto/db/client";
import { getJellyfinCredentials, getPlexCredentials } from "../../lib/server-credentials";
import {
  authenticateJellyfinByName,
  getJellyfinCurrentUserId,
  getJellyfinLibraryFolders,
} from "../../infrastructure/adapters/jellyfin";
import {
  authenticatePlexServerToken,
  getPlexSections,
} from "../../infrastructure/adapters/plex";
import {
  createUserConnection,
  findUserConnectionsByUserId,
  findUserConnectionByProvider,
  updateUserConnection,
} from "../../infrastructure/repositories/user-connection-repository";

export interface UserConnectionAuthResult {
  success: boolean;
  token?: string;
  externalUserId?: string;
  accessibleLibraries?: string[];
  error?: string;
}

/** Thrown when the global admin credentials for a media server aren't set. */
export class ServerNotConfiguredError extends Error {
  constructor(public readonly provider: "plex" | "jellyfin") {
    super(`${provider} server not configured by administrator`);
    this.name = "ServerNotConfiguredError";
  }
}

/**
 * Authenticate a per-user Plex token against the admin-configured Plex
 * server and return identity + the libraries they can see.
 */
export async function authenticatePlexUser(token: string): Promise<UserConnectionAuthResult> {
  const creds = await getPlexCredentials();
  if (!creds) throw new ServerNotConfiguredError("plex");

  try {
    const auth = await authenticatePlexServerToken(creds.url, token);
    if (!auth.ok) {
      return { success: false, error: "Invalid Plex token or cannot reach server" };
    }

    const sections = await getPlexSections(creds.url, token);
    const accessibleLibraries = sections.map((s) => s.key);

    return {
      success: true,
      token,
      externalUserId: auth.userId,
      accessibleLibraries,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown Plex authentication error",
    };
  }
}

/**
 * Authenticate a per-user Jellyfin session — either by existing token or by
 * username/password — against the admin-configured Jellyfin server.
 */
export async function authenticateJellyfinUser(
  input: { token: string } | { username: string; password: string },
): Promise<UserConnectionAuthResult> {
  const creds = await getJellyfinCredentials();
  if (!creds) throw new ServerNotConfiguredError("jellyfin");

  try {
    let token: string;
    let externalUserId: string;

    if ("token" in input) {
      token = input.token;
      const userId = await getJellyfinCurrentUserId(creds.url, token);
      if (!userId) return { success: false, error: "Invalid Jellyfin token" };
      externalUserId = userId;
    } else {
      const auth = await authenticateJellyfinByName(creds.url, input.username, input.password);
      if (!auth.ok) {
        if (auth.status === 401) {
          return { success: false, error: "Invalid username or password" };
        }
        return { success: false, error: `Authentication failed: HTTP ${auth.status}` };
      }
      token = auth.accessToken;
      externalUserId = auth.userId;
    }

    const libraries = await getJellyfinLibraryFolders(creds.url, token);
    const accessibleLibraries = libraries.map((l) => l.Id);

    return {
      success: true,
      token,
      externalUserId,
      accessibleLibraries,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown Jellyfin authentication error",
    };
  }
}

export function listUserConnections(db: Database, userId: string) {
  return findUserConnectionsByUserId(db, userId);
}

export async function addOrUpdateUserConnection(
  db: Database,
  userId: string,
  authResult: UserConnectionAuthResult,
  provider: "plex" | "jellyfin" | "trakt",
) {
  if (!authResult.success || !authResult.token || !authResult.externalUserId) {
    throw new Error("Cannot add connection without successful authentication");
  }

  const existing = await findUserConnectionByProvider(db, userId, provider);

  if (existing) {
    return updateUserConnection(db, existing.id, {
      token: authResult.token,
      externalUserId: authResult.externalUserId,
      accessibleLibraries: authResult.accessibleLibraries,
      enabled: true,
    });
  }

  return createUserConnection(db, {
    userId,
    provider,
    token: authResult.token,
    externalUserId: authResult.externalUserId,
    accessibleLibraries: authResult.accessibleLibraries,
    enabled: true,
  });
}
