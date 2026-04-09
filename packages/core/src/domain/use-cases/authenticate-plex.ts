import { randomUUID } from "crypto";
import { getSetting, setSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import { validateServiceUrl } from "../rules/validate-service-url";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Get or create a stable Plex client identifier (persisted in settings). */
async function getOrCreatePlexClientId(): Promise<string> {
  const existing = await getSetting<string>(SETTINGS.PLEX_CLIENT_ID);
  if (existing) return existing;
  const id = randomUUID();
  await setSetting(SETTINGS.PLEX_CLIENT_ID, id);
  return id;
}

export interface PlexAuthResult {
  success: boolean;
  error?: string;
  token?: string;
  machineId?: string;
  serverName?: string;
  user?: string;
  userId?: string;
}

/* -------------------------------------------------------------------------- */
/*  Authenticate with token                                                    */
/* -------------------------------------------------------------------------- */

export async function authenticatePlex(input: {
  url: string;
  token: string;
}): Promise<PlexAuthResult> {
  const baseUrl = input.url.replace(/\/$/, "");
  try {
    validateServiceUrl(baseUrl);
    const res = await fetch(`${baseUrl}/?X-Plex-Token=${input.token}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status === 401) return { success: false, error: "Invalid token" };
      return { success: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      MediaContainer: { friendlyName: string; machineIdentifier: string };
    };

    // Also get user info to get the Plex User ID
    let userId: string | undefined;
    let user: string | undefined;
    try {
      const userRes = await fetch("https://plex.tv/api/v2/user", {
        headers: {
          Accept: "application/json",
          "X-Plex-Product": "Canto",
          "X-Plex-Token": input.token,
        },
      });
      if (userRes.ok) {
        const userData = (await userRes.json()) as { id: number; username: string };
        userId = String(userData.id);
        user = userData.username;
      }
    } catch { /* Non-critical */ }

    return {
      success: true,
      token: input.token,
      machineId: data.MediaContainer.machineIdentifier,
      serverName: data.MediaContainer.friendlyName,
      user,
      userId,
    };
  } catch (err) {
    if (err instanceof Error && !err.message.includes("fetch")) {
      return { success: false, error: err.message };
    }
    const cause = (err as { cause?: { message?: string } })?.cause?.message;
    return { success: false, error: cause ? `Cannot reach server: ${cause}` : "Cannot reach the Plex server. Check the URL and ensure it is running." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Login via plex.tv (email + password)                                       */
/* -------------------------------------------------------------------------- */

export async function loginPlex(input: {
  url: string;
  email: string;
  password: string;
}): Promise<PlexAuthResult> {
  const baseUrl = input.url.replace(/\/$/, "");
  try {
    validateServiceUrl(baseUrl);
    const signInRes = await fetch("https://plex.tv/users/sign_in.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Plex-Client-Identifier": "canto-app",
        "X-Plex-Product": "Canto",
        "X-Plex-Version": "0.1.0",
      },
      body: JSON.stringify({ user: { login: input.email, password: input.password } }),
    });

    if (!signInRes.ok) {
      if (signInRes.status === 401) return { success: false, error: "Invalid email or password" };
      return { success: false, error: `plex.tv returned HTTP ${signInRes.status}` };
    }

    const signInData = (await signInRes.json()) as { user: { authToken: string; username: string; id: number } };
    const token = signInData.user.authToken;

    const serverRes = await fetch(`${baseUrl}/?X-Plex-Token=${token}`, {
      headers: { Accept: "application/json" },
    });
    if (!serverRes.ok) {
      return { success: false, error: "Logged in to plex.tv but could not connect to your server. Check the server URL." };
    }

    const serverData = (await serverRes.json()) as {
      MediaContainer: { friendlyName: string; machineIdentifier: string };
    };

    return {
      success: true,
      token,
      machineId: serverData.MediaContainer.machineIdentifier,
      serverName: serverData.MediaContainer.friendlyName,
      user: signInData.user.username,
      userId: String(signInData.user.id),
    };
  } catch (err) {
    if (err instanceof Error && !err.message.includes("fetch")) {
      return { success: false, error: err.message };
    }
    const cause = (err as { cause?: { message?: string } })?.cause?.message;
    return { success: false, error: cause ? `Cannot reach server: ${cause}` : "Cannot reach the Plex server. Check the URL and ensure it is running." };
  }
}

/* -------------------------------------------------------------------------- */
/*  PIN-based OAuth flow                                                       */
/* -------------------------------------------------------------------------- */

export async function createPlexPin(): Promise<{ pinId: number; pinCode: string; clientId: string }> {
  const clientId = await getOrCreatePlexClientId();
  const res = await fetch("https://plex.tv/api/v2/pins?strong=true", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Plex-Client-Identifier": clientId,
      "X-Plex-Product": "Canto",
      "X-Plex-Version": "0.1.0",
    },
  });
  if (!res.ok) throw new Error(`Plex PIN creation failed: ${res.status}`);
  const data = (await res.json()) as { id: number; code: string };
  return { pinId: data.id, pinCode: data.code, clientId };
}

export async function checkPlexPin(input: {
  pinId: number;
  clientId: string;
  serverUrl?: string;
}): Promise<{
  authenticated: boolean;
  expired?: boolean;
  token?: string;
  userId?: string;
  username?: string;
  serverName?: string;
  machineId?: string;
}> {
  if (input.serverUrl) validateServiceUrl(input.serverUrl);

  const res = await fetch(`https://plex.tv/api/v2/pins/${input.pinId}`, {
    headers: {
      Accept: "application/json",
      "X-Plex-Client-Identifier": input.clientId,
      "X-Plex-Product": "Canto",
      "X-Plex-Version": "0.1.0",
    },
  });

  if (!res.ok) return { authenticated: false, expired: true };

  const data = (await res.json()) as { authToken: string | null; expiresAt: string };
  if (!data.authToken) {
    const expired = new Date(data.expiresAt) < new Date();
    return { authenticated: false, expired };
  }

  const token = data.authToken;

  // Try to get user info
  let username: string | undefined;
  let userId: string | undefined;
  try {
    const userRes = await fetch("https://plex.tv/api/v2/user", {
      headers: {
        Accept: "application/json",
        "X-Plex-Client-Identifier": input.clientId,
        "X-Plex-Token": token,
      },
    });
    if (userRes.ok) {
      const userData = (await userRes.json()) as { id: number; username: string };
      username = userData.username;
      userId = String(userData.id);
    }
  } catch { /* Non-critical */ }

  // If server URL provided, validate
  let serverName: string | undefined;
  let machineId: string | undefined;
  if (input.serverUrl) {
    try {
      const serverRes = await fetch(`${input.serverUrl}/?X-Plex-Token=${token}`, {
        headers: { Accept: "application/json" },
      });
      if (serverRes.ok) {
        const serverData = (await serverRes.json()) as { MediaContainer: { friendlyName: string; machineIdentifier: string } };
        serverName = serverData.MediaContainer.friendlyName;
        machineId = serverData.MediaContainer.machineIdentifier;
      }
    } catch { /* Server not reachable */ }
  }

  // Auto-discover server if no URL provided
  if (!input.serverUrl) {
    try {
      const resourcesRes = await fetch(
        "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=0",
        {
          headers: {
            Accept: "application/json",
            "X-Plex-Client-Identifier": input.clientId,
            "X-Plex-Token": token,
          },
        },
      );
      if (resourcesRes.ok) {
        const resources = (await resourcesRes.json()) as Array<{
          name: string; provides: string; clientIdentifier: string;
          connections: Array<{ uri: string; local: boolean }>;
        }>;
        const server = resources.find((r) => r.provides.includes("server"));
        if (server) {
          machineId = server.clientIdentifier;
          const localConn = server.connections.find((c) => c.local);
          const conn = localConn ?? server.connections[0];
          // We don't save the URL here anymore, it will be saved in the router if needed,
          // but usually the admin sets the global URL.
          serverName = server.name;
        }
      }
    } catch { /* Non-critical */ }
  }

  return { authenticated: true, token, userId, username, serverName, machineId };
}
