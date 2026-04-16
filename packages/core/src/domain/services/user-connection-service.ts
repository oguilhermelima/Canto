import { TRPCError } from "@trpc/server";
import type { Database } from "@canto/db/client";
import { getJellyfinCredentials, getPlexCredentials } from "../../lib/server-credentials";
import { 
  testJellyfinConnection, 
  getJellyfinLibraryFolders 
} from "../../infrastructure/adapters/jellyfin";
import { 
  testPlexConnection, 
  getPlexSections 
} from "../../infrastructure/adapters/plex";
import { 
  createUserConnection, 
  findUserConnectionsByUserId,
  findUserConnectionByProvider,
  updateUserConnection
} from "../../infrastructure/repositories/user-connection-repository";

export interface UserConnectionAuthResult {
  success: boolean;
  token?: string;
  externalUserId?: string;
  accessibleLibraries?: string[];
  error?: string;
}

export class UserConnectionService {
  constructor(private db: Database) {}

  async authenticatePlex(token: string): Promise<UserConnectionAuthResult> {
    const creds = await getPlexCredentials();
    if (!creds) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Plex server not configured by administrator",
      });
    }

    try {
      // For Plex, we can use / to test connection and it returns server info if token is valid
      // But we also need the user's ID on that server.
      // Plex API for user info: https://plex.tv/api/v2/user
      // Actually, many Plex servers allow getting user info from /myplex/account
      
      const res = await fetch(`${creds.url}/myplex/account?X-Plex-Token=${token}`, {
        headers: { Accept: "application/json" },
      });
      
      if (!res.ok) {
        return { success: false, error: "Invalid Plex token or cannot reach server" };
      }

      const accountData = await res.json() as { MyPlex: { id: string | number } };
      const externalUserId = String(accountData.MyPlex.id);

      // Fetch accessible libraries
      const sections = await getPlexSections(creds.url, token);
      const accessibleLibraries = sections.map(s => s.key);

      return {
        success: true,
        token,
        externalUserId,
        accessibleLibraries,
      };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : "Unknown Plex authentication error" 
      };
    }
  }

  async authenticateJellyfin(
    input: { token: string } | { username: string; password: string }
  ): Promise<UserConnectionAuthResult> {
    const creds = await getJellyfinCredentials();
    if (!creds) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Jellyfin server not configured by administrator",
      });
    }

    let token: string;
    let externalUserId: string;

    try {
      if ("token" in input) {
        token = input.token;
        // Verify token and get user info
        const res = await fetch(`${creds.url}/Sessions/Current`, {
          headers: { "X-Emby-Token": token },
        });
        if (!res.ok) {
          return { success: false, error: "Invalid Jellyfin token" };
        }
        const sessionData = await res.json() as { UserId: string };
        externalUserId = sessionData.UserId;
      } else {
        // Authenticate with username/password
        const authRes = await fetch(`${creds.url}/Users/AuthenticateByName`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: 'MediaBrowser Client="Canto", Device="Canto", DeviceId="canto-user-connection", Version="0.1.0"',
          },
          body: JSON.stringify({ Username: input.username, Pw: input.password }),
        });

        if (!authRes.ok) {
          if (authRes.status === 401) return { success: false, error: "Invalid username or password" };
          return { success: false, error: `Authentication failed: HTTP ${authRes.status}` };
        }

        const authData = await authRes.json() as { AccessToken: string; User: { Id: string } };
        token = authData.AccessToken;
        externalUserId = authData.User.Id;
      }

      // Fetch accessible libraries
      const libraries = await getJellyfinLibraryFolders(creds.url, token);
      const accessibleLibraries = libraries.map(l => l.Id);

      return {
        success: true,
        token,
        externalUserId,
        accessibleLibraries,
      };
    } catch (err) {
      return { 
        success: false, 
        error: err instanceof Error ? err.message : "Unknown Jellyfin authentication error" 
      };
    }
  }

  async listConnections(userId: string) {
    return findUserConnectionsByUserId(this.db, userId);
  }

  async addOrUpdateConnection(
    userId: string,
    authResult: UserConnectionAuthResult,
    provider: "plex" | "jellyfin" | "trakt",
  ) {
    if (!authResult.success || !authResult.token || !authResult.externalUserId) {
      throw new Error("Cannot add connection without successful authentication");
    }

    const existing = await findUserConnectionByProvider(this.db, userId, provider);

    if (existing) {
      return updateUserConnection(this.db, existing.id, {
        token: authResult.token,
        externalUserId: authResult.externalUserId,
        accessibleLibraries: authResult.accessibleLibraries,
        enabled: true,
      });
    }

    return createUserConnection(this.db, {
      userId,
      provider,
      token: authResult.token,
      externalUserId: authResult.externalUserId,
      accessibleLibraries: authResult.accessibleLibraries,
      enabled: true,
    });
  }
}
