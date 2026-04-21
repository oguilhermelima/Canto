import { getSettings } from "@canto/db/settings";
import type { DownloadClientPort, TorrentInfo, TorrentFileInfo } from "../../../domain/ports/download-client";

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
      signal: AbortSignal.timeout(15_000),
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
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 403) {
      await this.login();
      return fetch(`${this.baseUrl}${path}`, {
        ...opts,
        headers: {
          ...(opts.headers as Record<string, string> | undefined),
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        signal: AbortSignal.timeout(15_000),
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

  async addTorrentFile(
    fileName: string,
    fileData: Uint8Array,
    category?: string,
    savePath?: string,
  ): Promise<void> {
    const body = new FormData();
    const normalized = new Uint8Array(fileData);
    body.set("torrents", new Blob([normalized.buffer]), fileName);
    if (category) body.set("category", category);
    if (savePath) body.set("savepath", savePath);

    const response = await this.request("/api/v2/torrents/add", {
      method: "POST",
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`qBittorrent add torrent file failed: ${response.status} ${text}`);
    }
  }

  async listTorrents(filter?: { hashes?: string[] }): Promise<TorrentInfo[]> {
    const params = new URLSearchParams();
    if (filter?.hashes?.length) {
      params.set("hashes", filter.hashes.join("|"));
    }
    const qs = params.toString();
    const url = qs ? `/api/v2/torrents/info?${qs}` : "/api/v2/torrents/info";
    const response = await this.request(url);
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

  async forceResumeTorrent(hash: string): Promise<void> {
    const forceStartBody = new URLSearchParams({ hashes: hash, value: "true" });
    const forceStartResponse = await this.request("/api/v2/torrents/setForceStart", {
      method: "POST",
      body: forceStartBody,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!forceStartResponse.ok) {
      throw new Error(`qBittorrent force start failed: ${forceStartResponse.status}`);
    }
    await this.resumeTorrent(hash);
  }

  async recheckTorrent(hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    const response = await this.request("/api/v2/torrents/recheck", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent recheck failed: ${response.status}`);
    }
  }

  async reannounceTorrent(hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    const response = await this.request("/api/v2/torrents/reannounce", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent reannounce failed: ${response.status}`);
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
    const response = await this.request("/api/v2/torrents/setCategory", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent setCategory failed: ${response.status}`);
    }
  }

  async getTorrentFiles(hash: string): Promise<TorrentFileInfo[]> {
    const response = await this.request(`/api/v2/torrents/files?hash=${hash}`);
    if (!response.ok) {
      throw new Error(`qBittorrent listFiles failed: ${response.status}`);
    }
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
    const response = await this.request("/api/v2/torrents/createCategory", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`qBittorrent createCategory failed: HTTP ${response.status} ${text}`.trim());
    }
  }

  async editCategory(category: string, savePath: string): Promise<void> {
    const body = new URLSearchParams({ category, savePath });
    const response = await this.request("/api/v2/torrents/editCategory", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`qBittorrent editCategory failed: HTTP ${response.status} ${text}`.trim());
    }
  }

  async removeCategories(categories: string[]): Promise<void> {
    if (categories.length === 0) return;
    const body = new URLSearchParams({ categories: categories.join("\n") });
    const response = await this.request("/api/v2/torrents/removeCategories", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      throw new Error(`qBittorrent removeCategories failed: HTTP ${response.status}`);
    }
  }

  async ensureCategory(category: string, _savePath?: string): Promise<void> {
    // Validate that the category exists — categories are managed in Settings > Libraries
    const existing = await this.listCategories();
    if (!existing[category]) {
      throw new Error(
        `qBittorrent category "${category}" does not exist. Create it in Settings > Libraries or in qBittorrent.`,
      );
    }
  }

  async listCategories(): Promise<Record<string, { name: string; savePath: string }>> {
    const response = await this.request("/api/v2/torrents/categories");
    if (!response.ok) return {};
    return response.json() as Promise<Record<string, { name: string; savePath: string }>>;
  }

  async getDefaultSavePath(): Promise<string> {
    const response = await this.request("/api/v2/app/defaultSavePath");
    if (!response.ok) return "";
    return (await response.text()).trim();
  }

  async getTransferInfo(): Promise<{
    dlSpeed: number;
    upSpeed: number;
    freeSpaceOnDisk: number;
  }> {
    const response = await this.request("/api/v2/sync/maindata");
    if (!response.ok) {
      throw new Error(`qBittorrent maindata failed: ${response.status}`);
    }
    const data = (await response.json()) as {
      server_state?: {
        dl_info_speed?: number;
        up_info_speed?: number;
        free_space_on_disk?: number;
      };
    };
    const s = data.server_state;
    return {
      dlSpeed: s?.dl_info_speed ?? 0,
      upSpeed: s?.up_info_speed ?? 0,
      freeSpaceOnDisk: s?.free_space_on_disk ?? 0,
    };
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
    const {
      "qbittorrent.url": url,
      "qbittorrent.username": user,
      "qbittorrent.password": pass,
    } = await getSettings([
      "qbittorrent.url",
      "qbittorrent.username",
      "qbittorrent.password",
    ]);
    qbClient = new QBittorrentClient(url ?? "", user ?? "", pass ?? "");
  }
  return qbClient;
}

/**
 * Reset the singleton so the next `getQBClient()` re-reads settings.
 * MUST be called whenever QBITTORRENT_URL, QBITTORRENT_USERNAME, or
 * QBITTORRENT_PASSWORD settings are saved (see settings router `set`/`setMany`).
 */
export function resetQBClient(): void {
  qbClient = null;
}
