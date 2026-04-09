import { validateServiceUrl } from "../rules/validate-service-url";

export interface JellyfinAuthResult {
  success: boolean;
  error?: string;
  token?: string;
  userId?: string;
  serverName?: string;
  user?: string;
}

/**
 * Authenticate with Jellyfin using username/password and obtain an API key.
 * Returns the result instead of saving to settings.
 */
export async function authenticateJellyfin(input: {
  url: string;
  username: string;
  password: string;
}): Promise<JellyfinAuthResult> {
  const baseUrl = input.url.replace(/\/$/, "");
  try {
    validateServiceUrl(baseUrl);
    const authRes = await fetch(`${baseUrl}/Users/AuthenticateByName`, {
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
      User: { Id: string; Name: string; Policy: { IsAdministrator: boolean } };
    };

    // Note: We don't strictly NEED the user to be an administrator if it's a per-user connection,
    // but the admin connection (global) might need it to fetch libraries.
    // However, the instructions don't specify this, so I'll keep it for now or remove it.
    // Actually, for per-user auth, they just need to be themselves.
    // The previous code had it, so I'll keep it as a returned field maybe?
    // No, let's just return the data.

    // Create a persistent API key
    const keyRes = await fetch(`${baseUrl}/Auth/Keys?App=Canto`, {
      method: "POST",
      headers: { "X-Emby-Token": authData.AccessToken },
    });

    let apiKey = authData.AccessToken;
    if (keyRes.ok) {
      const keysRes = await fetch(`${baseUrl}/Auth/Keys`, {
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

    // Get server info
    const infoRes = await fetch(`${baseUrl}/System/Info`, {
      headers: { "X-Emby-Token": apiKey },
    });
    let serverName = "";
    if (infoRes.ok) {
      const info = (await infoRes.json()) as { ServerName: string };
      serverName = info.ServerName;
    }

    return {
      success: true,
      token: apiKey,
      userId: authData.User.Id,
      serverName,
      user: authData.User.Name,
    };
  } catch (err) {
    if (err instanceof Error && !err.message.includes("fetch")) {
      // Validation or auth error with a meaningful message
      return { success: false, error: err.message };
    }
    const cause = (err as { cause?: { message?: string } })?.cause?.message;
    return { success: false, error: cause ? `Cannot reach server: ${cause}` : "Cannot reach the Jellyfin server. Check the URL and ensure it is running." };
  }
}
