import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import type { DownloadClientPort, TorrentInfo, TorrentFileInfo } from "../../domain/ports/download-client";

export class QBittorrentClient implements DownloadClientPort {
  private baseUrl: string;
  private username: string;
  private password: string;
  private cookie: string | null = null;

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
  }

  private async login(): Promise<void> {
    const body = new URLSearchParams({
      username: this.username,
      password: this.password,
    });
    const response = await fetch(`${this.baseUrl}/api/v2/auth/login`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!response.ok) {
      throw new Error(`qBittorrent login failed: ${response.status}`);
    }

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      this.cookie = setCookie.split(";")[0] ?? null;
    }
  }

  private async ensureAuth(): Promise<void> {
    if (!this.cookie) {
      await this.login();
    }
  }

  private async request(
    path: string,
    opts: RequestInit = {},
  ): Promise<Response> {
    await this.ensureAuth();

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...opts,
      headers: {
        ...(opts.headers as Record<string, string> | undefined),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
    });

    if (response.status === 403) {
      await this.login();
      return fetch(`${this.baseUrl}${path}`, {
        ...opts,
        headers: {
          ...(opts.headers as Record<string, string> | undefined),
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
      });
    }

    return response;
  }

  async addTorrent(
    magnetOrUrl: string,
    category?: string,
    savePath?: string,
  ): Promise<void> {
    const body = new URLSearchParams({ urls: magnetOrUrl });
    if (category) body.set("category", category);
    if (savePath) body.set("savepath", savePath);

    const response = await this.request("/api/v2/torrents/add", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`qBittorrent add torrent failed: ${response.status} ${text}`);
    }
  }

  async listTorrents(): Promise<TorrentInfo[]> {
    const response = await this.request("/api/v2/torrents/info");
    if (!response.ok) {
      throw new Error(`qBittorrent list failed: ${response.status}`);
    }
    return response.json() as Promise<TorrentInfo[]>;
  }

  async pauseTorrent(hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    const response = await this.request("/api/v2/torrents/pause", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent pause failed: ${response.status}`);
    }
  }

  async resumeTorrent(hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    const response = await this.request("/api/v2/torrents/resume", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent resume failed: ${response.status}`);
    }
  }

  async deleteTorrent(hash: string, deleteFiles: boolean): Promise<void> {
    const body = new URLSearchParams({
      hashes: hash,
      deleteFiles: String(deleteFiles),
    });
    const response = await this.request("/api/v2/torrents/delete", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent delete failed: ${response.status}`);
    }
  }

  async setCategory(hash: string, category: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash, category });
    await this.request("/api/v2/torrents/setCategory", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  async getTorrentFiles(hash: string): Promise<TorrentFileInfo[]> {
    const response = await this.request(`/api/v2/torrents/files?hash=${hash}`);
    if (!response.ok) return [];
    return response.json() as Promise<TorrentFileInfo[]>;
  }

  async setLocation(hash: string, location: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash, location });
    const response = await this.request("/api/v2/torrents/setLocation", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent setLocation failed: ${response.status}`);
    }
  }

  async listTorrentFiles(hash: string): Promise<Array<{ name: string; size: number }>> {
    const response = await this.request(`/api/v2/torrents/files?hash=${hash}`);
    if (!response.ok) {
      throw new Error(`qBittorrent listFiles failed: ${response.status}`);
    }
    return response.json() as Promise<Array<{ name: string; size: number }>>;
  }

  async renameFolder(hash: string, oldPath: string, newPath: string): Promise<void> {
    const body = new URLSearchParams({ hash, oldPath, newPath });
    const response = await this.request("/api/v2/torrents/renameFolder", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent renameFolder failed: ${response.status}`);
    }
  }

  async renameFile(hash: string, oldPath: string, newPath: string): Promise<void> {
    const body = new URLSearchParams({ hash, oldPath, newPath });
    const response = await this.request("/api/v2/torrents/renameFile", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent renameFile failed: ${response.status}`);
    }
  }

  async createCategory(category: string, savePath?: string): Promise<void> {
    const body = new URLSearchParams({ category });
    if (savePath) body.set("savePath", savePath);
    await this.request("/api/v2/torrents/createCategory", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    // 409 = category already exists, which is fine
  }

  async ensureCategory(category: string, savePath?: string): Promise<void> {
    try {
      await this.createCategory(category, savePath);
    } catch {
      // Category likely already exists — ignore
    }
  }

  async testConnection(): Promise<{ name: string; version: string }> {
    const response = await this.request("/api/v2/app/version");
    if (!response.ok) {
      throw new Error(`qBittorrent connection test failed: ${response.status}`);
    }
    const version = await response.text();
    return { name: "qBittorrent", version: version.trim() };
  }
}

/* Singleton */

let qbClient: QBittorrentClient | null = null;

export async function getQBClient(): Promise<QBittorrentClient> {
  if (!qbClient) {
    const url = (await getSetting(SETTINGS.QBITTORRENT_URL)) ?? "";
    const user = (await getSetting(SETTINGS.QBITTORRENT_USERNAME)) ?? "";
    const pass = (await getSetting(SETTINGS.QBITTORRENT_PASSWORD)) ?? "";
    qbClient = new QBittorrentClient(url, user, pass);
  }
  return qbClient;
}

export function resetQBClient(): void {
  qbClient = null;
}
