import { randomUUID } from "crypto";
import { getSetting, setSetting } from "@canto/db/settings";
import type { PlexAdapterPort } from "@canto/core/domain/media-servers/ports/plex-adapter.port";
import { validateServiceUrl } from "@canto/core/domain/media-servers/rules/validate-service-url";
import { fetchError } from "@canto/core/domain/media-servers/use-cases/authenticate/shared";

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

export interface PlexAuthDeps {
  plex: PlexAdapterPort;
}

/** Authenticate against a Plex server using an existing token. */
export async function authenticatePlex(
  input: { url: string; token: string },
  deps: PlexAuthDeps,
): Promise<PlexAuthResult> {
  const baseUrl = input.url.replace(/\/$/, "");
  try {
    validateServiceUrl(baseUrl);
    const res = await deps.plex.authenticateServerToken(baseUrl, input.token);
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
export async function loginPlex(
  input: { url: string; email: string; password: string },
  deps: PlexAuthDeps,
): Promise<PlexAuthResult> {
  const baseUrl = input.url.replace(/\/$/, "");
  try {
    validateServiceUrl(baseUrl);

    const signIn = await deps.plex.plexTvSignIn(input.email, input.password);
    if (!signIn.ok) {
      if (signIn.status === 401) {
        return { success: false, error: "Invalid email or password" };
      }
      return { success: false, error: `plex.tv returned HTTP ${signIn.status}` };
    }

    const server = await deps.plex.authenticateServerToken(baseUrl, signIn.token);
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
export async function createPlexPin(deps: PlexAuthDeps): Promise<{
  pinId: number;
  pinCode: string;
  clientId: string;
}> {
  const clientId = await getOrCreatePlexClientId();
  const { id, code } = await deps.plex.createPin(clientId);
  return { pinId: id, pinCode: code, clientId };
}

/** Poll a Plex PIN and (once claimed) resolve identity + server info. */
export async function checkPlexPin(
  input: { pinId: number; clientId: string; serverUrl?: string },
  deps: PlexAuthDeps,
): Promise<{
  authenticated: boolean;
  expired?: boolean;
  token?: string;
  userId?: string;
  username?: string;
  serverName?: string;
  machineId?: string;
}> {
  if (input.serverUrl) validateServiceUrl(input.serverUrl);

  const pin = await deps.plex.checkPin(input.clientId, input.pinId);
  if (!pin.authenticated) {
    return { authenticated: false, expired: pin.expired };
  }
  const token = pin.token;

  const identity = await deps.plex.getTvUser(input.clientId, token);

  let serverName: string | undefined;
  let machineId: string | undefined;

  if (input.serverUrl) {
    try {
      const info = await deps.plex.testConnection(input.serverUrl, token);
      serverName = info.serverName;
      // testConnection returns version, not machineId — pull machineId via
      // the dedicated token flow.
      const serverAuth = await deps.plex.authenticateServerToken(
        input.serverUrl,
        token,
      );
      if (serverAuth.ok) {
        machineId = serverAuth.machineId;
      }
    } catch {
      /* Server not reachable */
    }
  } else {
    const resource = await deps.plex.getTvServerResource(input.clientId, token);
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
