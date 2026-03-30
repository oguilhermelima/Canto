import { z } from "zod";

import {
  getAllSettings,
  getSetting,
  setSetting,
  deleteSetting,
} from "@canto/db/settings";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { SETTINGS } from "../lib/settings-keys";
import { randomUUID } from "crypto";

/** Get or create a stable Plex client identifier (persisted in settings). */
async function getOrCreatePlexClientId(): Promise<string> {
  const existing = await getSetting<string>(SETTINGS.PLEX_CLIENT_ID);
  if (existing) return existing;
  const id = randomUUID();
  await setSetting(SETTINGS.PLEX_CLIENT_ID, id);
  return id;
}

const serviceEnum = z.enum([
  "jellyfin",
  "plex",
  "qbittorrent",
  "prowlarr",
  "jackett",
]);

const ALL_SERVICES = serviceEnum.options;

export const settingsRouter = createTRPCRouter({
  /** Get all settings as a key-value record */
  getAll: publicProcedure.query(async () => {
    return getAllSettings();
  }),

  /** Get a single setting by key */
  get: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      return getSetting(input.key);
    }),

  /** Upsert a setting (admin only) */
  set: protectedProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(async ({ input }) => {
      await setSetting(input.key, input.value);
      return { success: true };
    }),

  /** Delete a setting (admin only) */
  delete: protectedProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ input }) => {
      await deleteSetting(input.key);
      return { success: true };
    }),

  /** Bulk upsert multiple settings at once */
  setMany: protectedProcedure
    .input(z.record(z.string(), z.unknown()))
    .mutation(async ({ input }) => {
      for (const [key, value] of Object.entries(input)) {
        await setSetting(key, value);
      }
      return { success: true };
    }),

  /** Test connectivity using the provided values (not from DB) */
  testService: publicProcedure
    .input(
      z.object({
        service: serviceEnum,
        values: z.record(z.string(), z.string()),
      }),
    )
    .mutation(async ({ input }) => {
      const v = input.values;

      switch (input.service) {
        case "jellyfin": {
          const url = v["jellyfin.url"];
          const apiKey = v["jellyfin.apiKey"];
          if (!url || !apiKey) {
            return { connected: false, error: "URL or API key not configured" };
          }
          try {
            const res = await fetch(`${url}/System/Info`, {
              headers: { "X-Emby-Token": apiKey },
            });
            if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
            const info = (await res.json()) as { ServerName: string; Version: string };
            return { connected: true, serverName: info.ServerName, version: info.Version };
          } catch (err) {
            return { connected: false, error: err instanceof Error ? err.message : "Connection failed" };
          }
        }

        case "plex": {
          const url = v["plex.url"];
          const token = v["plex.token"];
          if (!url || !token) {
            return { connected: false, error: "URL or token not configured" };
          }
          try {
            const res = await fetch(`${url}/?X-Plex-Token=${token}`, {
              headers: { Accept: "application/json" },
            });
            if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
            const data = (await res.json()) as {
              MediaContainer: { friendlyName: string; version: string };
            };
            return {
              connected: true,
              serverName: data.MediaContainer.friendlyName,
              version: data.MediaContainer.version,
            };
          } catch (err) {
            return { connected: false, error: err instanceof Error ? err.message : "Connection failed" };
          }
        }

        case "qbittorrent": {
          const url = v["qbittorrent.url"];
          const username = v["qbittorrent.username"] ?? "";
          const password = v["qbittorrent.password"] ?? "";
          if (!url) {
            return { connected: false, error: "URL not configured" };
          }
          try {
            const body = new URLSearchParams({ username, password });
            const res = await fetch(`${url}/api/v2/auth/login`, {
              method: "POST",
              body,
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
            const text = await res.text();
            if (text.includes("Fails")) {
              return { connected: false, error: "Invalid credentials" };
            }
            return { connected: true };
          } catch (err) {
            return { connected: false, error: err instanceof Error ? err.message : "Connection failed" };
          }
        }

        case "prowlarr": {
          const url = v["prowlarr.url"];
          const apiKey = v["prowlarr.apiKey"];
          if (!url || !apiKey) {
            return { connected: false, error: "URL or API key not configured" };
          }
          try {
            const res = await fetch(`${url}/api/v1/health?apikey=${apiKey}`);
            if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
            return { connected: true };
          } catch (err) {
            return { connected: false, error: err instanceof Error ? err.message : "Connection failed" };
          }
        }

        case "jackett": {
          const url = v["jackett.url"];
          const apiKey = v["jackett.apiKey"];
          if (!url || !apiKey) {
            return { connected: false, error: "URL or API key not configured" };
          }
          try {
            const res = await fetch(
              `${url}/api/v2.0/indexers/all/results/torznab/api?apikey=${apiKey}&t=caps`,
            );
            if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
            return { connected: true };
          } catch (err) {
            return { connected: false, error: err instanceof Error ? err.message : "Connection failed" };
          }
        }
      }
    }),

  /** Toggle a service on/off */
  toggleService: protectedProcedure
    .input(z.object({ service: serviceEnum, enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      await setSetting(`${input.service}.enabled`, input.enabled);
      return { success: true };
    }),

  /** Get enabled state for all services */
  getEnabledServices: publicProcedure.query(async () => {
    const result: Record<string, boolean> = {};
    for (const s of ALL_SERVICES) {
      const val = await getSetting<boolean>(`${s}.enabled`);
      result[s] = val === true;
    }
    return result;
  }),

  /**
   * Authenticate with Jellyfin using username/password and obtain an API key.
   * Saves the URL and key to settings on success.
   */
  authenticateJellyfin: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
        username: z.string().min(1),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Authenticate
        const authRes = await fetch(
          `${input.url}/Users/AuthenticateByName`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization:
                'MediaBrowser Client="Canto", Device="Canto", DeviceId="canto-setup", Version="0.1.0"',
            },
            body: JSON.stringify({
              Username: input.username,
              Pw: input.password,
            }),
          },
        );

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
        const keyRes = await fetch(
          `${input.url}/Auth/Keys?App=Canto`,
          {
            method: "POST",
            headers: { "X-Emby-Token": authData.AccessToken },
          },
        );

        // Fetch the newly created key
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

        // Save to settings
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

        return {
          success: true,
          serverName,
          user: authData.User.Name,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Connection failed",
        };
      }
    }),

  /**
   * Authenticate with Plex using a token.
   * Validates and saves the URL and token.
   */
  authenticatePlex: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
        token: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const res = await fetch(
          `${input.url}/?X-Plex-Token=${input.token}`,
          { headers: { Accept: "application/json" } },
        );

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

        return {
          success: true,
          serverName: data.MediaContainer.friendlyName,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Connection failed",
        };
      }
    }),

  /**
   * Authenticate with Plex via plex.tv using email + password.
   * Gets an auth token from plex.tv, validates against the server, and saves.
   */
  loginPlex: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
        email: z.string().min(1),
        password: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Sign in via plex.tv
        const signInRes = await fetch("https://plex.tv/users/sign_in.json", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Plex-Client-Identifier": "canto-app",
            "X-Plex-Product": "Canto",
            "X-Plex-Version": "0.1.0",
          },
          body: JSON.stringify({
            user: { login: input.email, password: input.password },
          }),
        });

        if (!signInRes.ok) {
          if (signInRes.status === 401) return { success: false, error: "Invalid email or password" };
          return { success: false, error: `plex.tv returned HTTP ${signInRes.status}` };
        }

        const signInData = (await signInRes.json()) as {
          user: { authToken: string; username: string };
        };

        const token = signInData.user.authToken;

        // Validate token against the local server
        const serverRes = await fetch(
          `${input.url}/?X-Plex-Token=${token}`,
          { headers: { Accept: "application/json" } },
        );

        if (!serverRes.ok) {
          return { success: false, error: "Logged in to plex.tv but could not connect to your server. Check the server URL." };
        }

        const serverData = (await serverRes.json()) as {
          MediaContainer: { friendlyName: string; machineIdentifier: string };
        };

        await setSetting(SETTINGS.PLEX_URL, input.url);
        await setSetting(SETTINGS.PLEX_TOKEN, token);
        await setSetting(SETTINGS.PLEX_MACHINE_ID, serverData.MediaContainer.machineIdentifier);

        return {
          success: true,
          serverName: serverData.MediaContainer.friendlyName,
          user: signInData.user.username,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Connection failed",
        };
      }
    }),

  /**
   * Create a Plex PIN for the OAuth flow.
   * Returns the PIN id and code to redirect the user to app.plex.tv/auth.
   */
  plexPinCreate: publicProcedure.mutation(async () => {
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

    if (!res.ok) {
      throw new Error(`Plex PIN creation failed: ${res.status}`);
    }

    const data = (await res.json()) as { id: number; code: string };
    return { pinId: data.id, pinCode: data.code, clientId };
  }),

  /**
   * Poll a Plex PIN to check if the user has authenticated.
   * Once authToken is present, validate against the server and save.
   */
  plexPinCheck: publicProcedure
    .input(
      z.object({
        pinId: z.number(),
        clientId: z.string(),
        serverUrl: z.string().url().optional(),
      }),
    )
    .query(async ({ input }) => {
      const res = await fetch(`https://plex.tv/api/v2/pins/${input.pinId}`, {
        headers: {
          Accept: "application/json",
          "X-Plex-Client-Identifier": input.clientId,
          "X-Plex-Product": "Canto",
          "X-Plex-Version": "0.1.0",
        },
      });

      if (!res.ok) {
        return { authenticated: false, expired: true };
      }

      const data = (await res.json()) as { authToken: string | null; expiresAt: string };
      if (!data.authToken) {
        const expired = new Date(data.expiresAt) < new Date();
        return { authenticated: false, expired };
      }

      // Got a token — save it
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
      } catch {
        // Non-critical
      }

      // If server URL provided, validate and save
      let serverName: string | undefined;
      if (input.serverUrl) {
        try {
          const serverRes = await fetch(
            `${input.serverUrl}/?X-Plex-Token=${token}`,
            { headers: { Accept: "application/json" } },
          );
          if (serverRes.ok) {
            const serverData = (await serverRes.json()) as {
              MediaContainer: { friendlyName: string };
            };
            serverName = serverData.MediaContainer.friendlyName;
            await setSetting(SETTINGS.PLEX_URL, input.serverUrl);
          }
        } catch {
          // Server not reachable, still save token
        }
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
              name: string;
              provides: string;
              clientIdentifier: string;
              connections: Array<{ uri: string; local: boolean }>;
            }>;
            const server = resources.find((r) => r.provides.includes("server"));
            if (server) {
              // Save machineIdentifier (needed for deep links)
              await setSetting(SETTINGS.PLEX_MACHINE_ID, server.clientIdentifier);

              // Pick the best local connection
              const localConn = server.connections.find((c) => c.local);
              const conn = localConn ?? server.connections[0];
              if (conn) {
                await setSetting(SETTINGS.PLEX_URL, conn.uri);
              }

              serverName = server.name;
            }
          }
        } catch {
          // Non-critical
        }
      }

      return { authenticated: true, username, serverName };
    }),
});
