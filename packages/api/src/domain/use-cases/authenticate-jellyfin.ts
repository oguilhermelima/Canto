import { setSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import { validateServiceUrl } from "../rules/validate-service-url";

export interface AuthResult {
  success: boolean;
  error?: string;
  serverName?: string;
  user?: string;
}

/**
 * Authenticate with Jellyfin using username/password and obtain an API key.
 * Saves the URL and key to settings on success.
 */
export async function authenticateJellyfin(input: {
  url: string;
  username: string;
  password: string;
}): Promise<AuthResult> {
  validateServiceUrl(input.url);
  try {
    const authRes = await fetch(`${input.url}/Users/AuthenticateByName`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: 'MediaBrowser Client="Canto", Device="Canto", DeviceId="canto-setup", Version="0.1.0"',
      },
      body: JSON.stringify({ Username: input.username, Pw: input.password }),
    });

    if (!authRes.ok) {
      const status = authRes.status;
      if (status === 401) return { success: false, error: "Invalid username or password" };
      return { success: false, error: `Authentication failed: HTTP ${status}` };
    }

    const authData = (await authRes.json()) as {
      AccessToken: string;
      User: { Name: string; Policy: { IsAdministrator: boolean } };
    };

    if (!authData.User.Policy.IsAdministrator) {
      return { success: false, error: "User must be an administrator" };
    }

    // Create a persistent API key
    const keyRes = await fetch(`${input.url}/Auth/Keys?App=Canto`, {
      method: "POST",
      headers: { "X-Emby-Token": authData.AccessToken },
    });

    let apiKey = authData.AccessToken;
    if (keyRes.ok) {
      const keysRes = await fetch(`${input.url}/Auth/Keys`, {
        headers: { "X-Emby-Token": authData.AccessToken },
      });
      if (keysRes.ok) {
        const keysData = (await keysRes.json()) as {
          Items: Array<{ AccessToken: string; AppName: string }>;
        };
        const cantoKey = keysData.Items.find((k) => k.AppName === "Canto");
        if (cantoKey) apiKey = cantoKey.AccessToken;
      }
    }

    await setSetting(SETTINGS.JELLYFIN_URL, input.url);
    await setSetting(SETTINGS.JELLYFIN_API_KEY, apiKey);

    // Get server info
    const infoRes = await fetch(`${input.url}/System/Info`, {
      headers: { "X-Emby-Token": apiKey },
    });
    let serverName = "";
    if (infoRes.ok) {
      const info = (await infoRes.json()) as { ServerName: string };
      serverName = info.ServerName;
    }

    return { success: true, serverName, user: authData.User.Name };
  } catch {
    return { success: false, error: "Connection failed" };
  }
}
