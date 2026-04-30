import type { JellyfinAdapterPort } from "@canto/core/domain/media-servers/ports/jellyfin-adapter.port";
import { validateServiceUrl } from "@canto/core/domain/media-servers/rules/validate-service-url";
import { fetchError } from "@canto/core/domain/media-servers/use-cases/authenticate/shared";

export interface JellyfinAuthResult {
  success: boolean;
  error?: string;
  token?: string;
  userId?: string;
  serverName?: string;
  user?: string;
}

export interface JellyfinAuthDeps {
  jellyfin: JellyfinAdapterPort;
}

/**
 * Authenticate with Jellyfin using username/password, then upgrade to a
 * persistent Canto API key when possible. Returns auth fields suitable for
 * persisting; caller handles error → HTTP mapping.
 */
export async function authenticateJellyfin(
  input: { url: string; username: string; password: string },
  deps: JellyfinAuthDeps,
): Promise<JellyfinAuthResult> {
  const baseUrl = input.url.replace(/\/$/, "");
  try {
    validateServiceUrl(baseUrl);

    const ping = await deps.jellyfin.pingPublic(baseUrl);
    if (!ping.ok) {
      return {
        success: false,
        error:
          ping.reason === "unreachable"
            ? "Cannot reach the Jellyfin server. Check the URL and ensure it is running."
            : "That URL doesn't look like a Jellyfin server. Double-check the address (include the port, e.g. http://192.168.1.100:8096).",
      };
    }

    const auth = await deps.jellyfin.authenticateByName(
      baseUrl,
      input.username,
      input.password,
    );
    if (!auth.ok) {
      if (auth.status === 401) {
        return { success: false, error: "Invalid username or password" };
      }
      return { success: false, error: `Authentication failed: HTTP ${auth.status}` };
    }

    let apiKey = auth.accessToken;
    if (await deps.jellyfin.createApiKey(baseUrl, auth.accessToken)) {
      const stored = await deps.jellyfin.findApiKey(baseUrl, auth.accessToken);
      if (stored) apiKey = stored;
    }

    let serverName = "";
    try {
      const info = await deps.jellyfin.testConnection(baseUrl, apiKey);
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
