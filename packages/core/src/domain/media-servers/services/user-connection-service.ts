import type { JellyfinAdapterPort } from "@canto/core/domain/media-servers/ports/jellyfin-adapter.port";
import type { PlexAdapterPort } from "@canto/core/domain/media-servers/ports/plex-adapter.port";
import type { ServerCredentialsPort } from "@canto/core/domain/media-servers/ports/server-credentials.port";
import type { UserConnectionRepositoryPort } from "@canto/core/domain/media-servers/ports/user-connection-repository.port";
import type {
  ConnectionKind,
  UserConnection,
} from "@canto/core/domain/media-servers/types/user-connection";
import {
  ServerNotConfiguredError,
  UserConnectionMissingAuthError,
} from "@canto/core/domain/media-servers/errors";

export interface UserConnectionAuthResult {
  success: boolean;
  token?: string;
  externalUserId?: string;
  accessibleLibraries?: string[];
  error?: string;
}

export type { ServerNotConfiguredError, UserConnectionMissingAuthError };

/**
 * Authenticate a per-user Plex token against the admin-configured Plex
 * server and return identity + the libraries they can see.
 */
export async function authenticatePlexUser(
  token: string,
  deps: { plex: PlexAdapterPort; credentials: ServerCredentialsPort },
): Promise<UserConnectionAuthResult> {
  const creds = await deps.credentials.getPlex();
  if (!creds) throw new ServerNotConfiguredError("plex");

  try {
    const auth = await deps.plex.authenticateServerToken(creds.url, token);
    if (!auth.ok) {
      return { success: false, error: "Invalid Plex token or cannot reach server" };
    }

    const sections = await deps.plex.getSections(creds.url, token);
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
  deps: { jellyfin: JellyfinAdapterPort; credentials: ServerCredentialsPort },
): Promise<UserConnectionAuthResult> {
  const creds = await deps.credentials.getJellyfin();
  if (!creds) throw new ServerNotConfiguredError("jellyfin");

  try {
    let token: string;
    let externalUserId: string;

    if ("token" in input) {
      token = input.token;
      const userId = await deps.jellyfin.getCurrentUserId(creds.url, token);
      if (!userId) return { success: false, error: "Invalid Jellyfin token" };
      externalUserId = userId;
    } else {
      const auth = await deps.jellyfin.authenticateByName(
        creds.url,
        input.username,
        input.password,
      );
      if (!auth.ok) {
        if (auth.status === 401) {
          return { success: false, error: "Invalid username or password" };
        }
        return { success: false, error: `Authentication failed: HTTP ${auth.status}` };
      }
      token = auth.accessToken;
      externalUserId = auth.userId;
    }

    const libraries = await deps.jellyfin.getLibraryFolders(creds.url, token);
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

export function listUserConnections(
  userId: string,
  deps: { repo: UserConnectionRepositoryPort },
): Promise<UserConnection[]> {
  return deps.repo.findByUserId(userId);
}

export async function addOrUpdateUserConnection(
  userId: string,
  authResult: UserConnectionAuthResult,
  provider: ConnectionKind,
  deps: { repo: UserConnectionRepositoryPort },
): Promise<UserConnection | undefined> {
  if (!authResult.success || !authResult.token || !authResult.externalUserId) {
    throw new UserConnectionMissingAuthError();
  }

  const existing = await deps.repo.findByProvider(userId, provider);

  if (existing) {
    return deps.repo.update(existing.id, {
      token: authResult.token,
      externalUserId: authResult.externalUserId,
      accessibleLibraries: authResult.accessibleLibraries ?? null,
      enabled: true,
    });
  }

  return deps.repo.create({
    userId,
    provider,
    token: authResult.token,
    externalUserId: authResult.externalUserId,
    accessibleLibraries: authResult.accessibleLibraries ?? null,
    enabled: true,
  });
}
