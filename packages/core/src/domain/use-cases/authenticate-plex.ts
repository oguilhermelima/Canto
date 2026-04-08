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

/* -------------------------------------------------------------------------- */
/*  Authenticate with token                                                    */
/* -------------------------------------------------------------------------- */

export async function authenticatePlex(input: {
  url: string;
  token: string;
}): Promise<{ success: boolean; error?: string; serverName?: string }> {
  validateServiceUrl(input.url);
  try {
    const res = await fetch(`${input.url}/?X-Plex-Token=${input.token}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status === 401) return { success: false, error: "Invalid token" };
      return { success: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      MediaContainer: { friendlyName: string; machineIdentifier: string };
    };
    await setSetting(SETTINGS.PLEX_URL, input.url);
    await setSetting(SETTINGS.PLEX_TOKEN, input.token);
    await setSetting(SETTINGS.PLEX_MACHINE_ID, data.MediaContainer.machineIdentifier);
    return { success: true, serverName: data.MediaContainer.friendlyName };
  } catch {
    return { success: false, error: "Connection failed" };
  }
}

/* -------------------------------------------------------------------------- */
/*  Login via plex.tv (email + password)                                       */
/* -------------------------------------------------------------------------- */

export async function loginPlex(input: {
  url: string;
  email: string;
  password: string;
}): Promise<{ success: boolean; error?: string; serverName?: string; user?: string }> {
  try {
    validateServiceUrl(input.url);
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

    const signInData = (await signInRes.json()) as { user: { authToken: string; username: string } };
    const token = signInData.user.authToken;

    const serverRes = await fetch(`${input.url}/?X-Plex-Token=${token}`, {
      headers: { Accept: "application/json" },
    });
    if (!serverRes.ok) {
      return { success: false, error: "Logged in to plex.tv but could not connect to your server. Check the server URL." };
    }

    const serverData = (await serverRes.json()) as {
      MediaContainer: { friendlyName: string; machineIdentifier: string };
    };

    await setSetting(SETTINGS.PLEX_URL, input.url);
    await setSetting(SETTINGS.PLEX_TOKEN, token);
    await setSetting(SETTINGS.PLEX_MACHINE_ID, serverData.MediaContainer.machineIdentifier);

    return { success: true, serverName: serverData.MediaContainer.friendlyName, user: signInData.user.username };
  } catch {
    return { success: false, error: "Connection failed" };
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
}): Promise<{ authenticated: boolean; expired?: boolean; username?: string; serverName?: string }> {
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
  await setSetting(SETTINGS.PLEX_TOKEN, token);

  // Try to get user info
  let username: string | undefined;
  try {
    const userRes = await fetch("https://plex.tv/api/v2/user", {
      headers: {
        Accept: "application/json",
        "X-Plex-Client-Identifier": input.clientId,
        "X-Plex-Token": token,
      },
    });
    if (userRes.ok) {
      const userData = (await userRes.json()) as { username: string };
      username = userData.username;
    }
  } catch { /* Non-critical */ }

  // If server URL provided, validate and save
  let serverName: string | undefined;
  if (input.serverUrl) {
    try {
      const serverRes = await fetch(`${input.serverUrl}/?X-Plex-Token=${token}`, {
        headers: { Accept: "application/json" },
      });
      if (serverRes.ok) {
        const serverData = (await serverRes.json()) as { MediaContainer: { friendlyName: string; machineIdentifier: string } };
        serverName = serverData.MediaContainer.friendlyName;
        await setSetting(SETTINGS.PLEX_URL, input.serverUrl);
        await setSetting(SETTINGS.PLEX_MACHINE_ID, serverData.MediaContainer.machineIdentifier);
      }
    } catch { /* Server not reachable, still save token */ }
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
          await setSetting(SETTINGS.PLEX_MACHINE_ID, server.clientIdentifier);
          const localConn = server.connections.find((c) => c.local);
          const conn = localConn ?? server.connections[0];
          if (conn) await setSetting(SETTINGS.PLEX_URL, conn.uri);
          serverName = server.name;
        }
      }
    } catch { /* Non-critical */ }
  }

  return { authenticated: true, username, serverName };
}
