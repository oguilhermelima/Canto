import { randomUUID } from "crypto";
import { getSetting, setSetting } from "@canto/db/settings";
import { validateServiceUrl } from "../rules/validate-service-url";
import {
  authenticatePlexServerToken,
  checkPlexTvPin,
  createPlexTvPin,
  getPlexTvServerResource,
  getPlexTvUser,
  plexTvSignIn,
  testPlexConnection,
} from "../../infrastructure/adapters/plex";
import {
  authenticateJellyfinByName,
  createJellyfinApiKey,
  findJellyfinApiKey,
  testJellyfinConnection,
} from "../../infrastructure/adapters/jellyfin";

/* -------------------------------------------------------------------------- */
/*  Plex                                                                       */
/* -------------------------------------------------------------------------- */

async function getOrCreatePlexClientId(): Promise<string> {
  const existing = await getSetting("plex.clientId");
  if (existing) return existing;
  const id = randomUUID();
  await setSetting("plex.clientId", id);
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

function fetchError(err: unknown, fallback: string): string {
  if (err instanceof Error && !err.message.includes("fetch")) return err.message;
  const cause = (err as { cause?: { message?: string } })?.cause?.message;
  return cause ? `Cannot reach server: ${cause}` : fallback;
}

/** Authenticate against a Plex server using an existing token. */
export async function authenticatePlex(input: {
  url: string;
  token: string;
}): Promise<PlexAuthResult> {
  const baseUrl = input.url.replace(/\/$/, "");
  try {
    validateServiceUrl(baseUrl);
    const res = await authenticatePlexServerToken(baseUrl, input.token);
    if (!res.ok) {
      if (res.status === 401) return { success: false, error: "Invalid token" };
      return { success: false, error: `HTTP ${res.status}` };
    }
    return {
      success: true,
      token: input.token,
      machineId: res.machineId,
      serverName: res.serverName,
      user: res.user,
      userId: res.userId,
    };
  } catch (err) {
    return {
      success: false,
      error: fetchError(
        err,
        "Cannot reach the Plex server. Check the URL and ensure it is running.",
      ),
    };
  }
}

/** Authenticate via plex.tv with email + password, then validate the server. */
export async function loginPlex(input: {
  url: string;
  email: string;
  password: string;
}): Promise<PlexAuthResult> {
  const baseUrl = input.url.replace(/\/$/, "");
  try {
    validateServiceUrl(baseUrl);

    const signIn = await plexTvSignIn(input.email, input.password);
    if (!signIn.ok) {
      if (signIn.status === 401) {
        return { success: false, error: "Invalid email or password" };
      }
      return { success: false, error: `plex.tv returned HTTP ${signIn.status}` };
    }

    const server = await authenticatePlexServerToken(baseUrl, signIn.token);
    if (!server.ok) {
      return {
        success: false,
        error:
          "Logged in to plex.tv but could not connect to your server. Check the server URL.",
      };
    }

    return {
      success: true,
      token: signIn.token,
      machineId: server.machineId,
      serverName: server.serverName,
      user: signIn.username,
      userId: signIn.userId,
    };
  } catch (err) {
    return {
      success: false,
      error: fetchError(
        err,
        "Cannot reach the Plex server. Check the URL and ensure it is running.",
      ),
    };
  }
}

/** Create a PIN for the Plex OAuth flow. */
export async function createPlexPin(): Promise<{
  pinId: number;
  pinCode: string;
  clientId: string;
}> {
  const clientId = await getOrCreatePlexClientId();
  const { id, code } = await createPlexTvPin(clientId);
  return { pinId: id, pinCode: code, clientId };
}

/** Poll a Plex PIN and (once claimed) resolve identity + server info. */
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

  const pin = await checkPlexTvPin(input.clientId, input.pinId);
  if (!pin.authenticated) {
    return { authenticated: false, expired: pin.expired };
  }
  const token = pin.token;

  const identity = await getPlexTvUser(input.clientId, token);

  let serverName: string | undefined;
  let machineId: string | undefined;

  if (input.serverUrl) {
    try {
      const info = await testPlexConnection(input.serverUrl, token);
      serverName = info.serverName;
      // testPlexConnection returns version, not machineId — pull machineId
      // via the dedicated token flow.
      const serverAuth = await authenticatePlexServerToken(input.serverUrl, token);
      if (serverAuth.ok) {
        machineId = serverAuth.machineId;
      }
    } catch {
      /* Server not reachable */
    }
  } else {
    const resource = await getPlexTvServerResource(input.clientId, token);
    if (resource) {
      serverName = resource.serverName;
      machineId = resource.machineId;
    }
  }

  return {
    authenticated: true,
    token,
    userId: identity?.userId,
    username: identity?.username,
    serverName,
    machineId,
  };
}

/* -------------------------------------------------------------------------- */
/*  Jellyfin                                                                   */
/* -------------------------------------------------------------------------- */

export interface JellyfinAuthResult {
  success: boolean;
  error?: string;
  token?: string;
  userId?: string;
  serverName?: string;
  user?: string;
}

/**
 * Authenticate with Jellyfin using username/password, then upgrade to a
 * persistent Canto API key when possible. Returns auth fields suitable for
 * persisting; caller handles error → HTTP mapping.
 */
export async function authenticateJellyfin(input: {
  url: string;
  username: string;
  password: string;
}): Promise<JellyfinAuthResult> {
  const baseUrl = input.url.replace(/\/$/, "");
  try {
    validateServiceUrl(baseUrl);

    const auth = await authenticateJellyfinByName(baseUrl, input.username, input.password);
    if (!auth.ok) {
      if (auth.status === 401) {
        return { success: false, error: "Invalid username or password" };
      }
      return { success: false, error: `Authentication failed: HTTP ${auth.status}` };
    }

    let apiKey = auth.accessToken;
    if (await createJellyfinApiKey(baseUrl, auth.accessToken)) {
      const stored = await findJellyfinApiKey(baseUrl, auth.accessToken);
      if (stored) apiKey = stored;
    }

    let serverName = "";
    try {
      const info = await testJellyfinConnection(baseUrl, apiKey);
      serverName = info.serverName;
    } catch {
      /* Non-critical: server info lookup failed, fall back to empty name */
    }

    return {
      success: true,
      token: apiKey,
      userId: auth.userId,
      serverName,
      user: auth.userName,
    };
  } catch (err) {
    return {
      success: false,
      error: fetchError(
        err,
        "Cannot reach the Jellyfin server. Check the URL and ensure it is running.",
      ),
    };
  }
}
