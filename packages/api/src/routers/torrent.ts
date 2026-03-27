import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { media, torrent } from "@canto/db/schema";
import {
  torrentDownloadInput,
  torrentSearchInput,
} from "@canto/validators";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../trpc";

/* -------------------------------------------------------------------------- */
/*  qBittorrent API Client                                                    */
/* -------------------------------------------------------------------------- */

class QBittorrentClient {
  private baseUrl: string;
  private cookie: string | null = null;

  constructor() {
    this.baseUrl =
      process.env.QBITTORRENT_URL ?? "http://localhost:8080";
  }

  /** Authenticate with qBittorrent and store the session cookie. */
  private async login(): Promise<void> {
    const username = process.env.QBITTORRENT_USERNAME ?? "admin";
    const password = process.env.QBITTORRENT_PASSWORD ?? "adminadmin";

    const body = new URLSearchParams({ username, password });
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

  /** Ensure we have a valid session. */
  private async ensureAuth(): Promise<void> {
    if (!this.cookie) {
      await this.login();
    }
  }

  /** Make an authenticated request to qBittorrent. */
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

    // If unauthorized, retry login once
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

  /** Add a torrent by magnet link or URL. */
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

  /** List all torrents. */
  async listTorrents(): Promise<
    Array<{
      hash: string;
      name: string;
      state: string;
      progress: number;
      size: number;
      dlspeed: number;
      upspeed: number;
      eta: number;
      save_path: string;
      category: string;
      content_path: string;
    }>
  > {
    const response = await this.request("/api/v2/torrents/info");
    if (!response.ok) {
      throw new Error(`qBittorrent list failed: ${response.status}`);
    }
    return response.json() as Promise<
      Array<{
        hash: string;
        name: string;
        state: string;
        progress: number;
        size: number;
        dlspeed: number;
        upspeed: number;
        eta: number;
        save_path: string;
        category: string;
        content_path: string;
      }>
    >;
  }

  /** Pause a torrent by hash. */
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

  /** Resume a torrent by hash. */
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

  /** Delete a torrent by hash, optionally deleting files. */
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
}

/* -------------------------------------------------------------------------- */
/*  Prowlarr API Client                                                       */
/* -------------------------------------------------------------------------- */

interface ProwlarrResult {
  guid: string;
  title: string;
  size: number;
  publishDate: string;
  downloadUrl: string | null;
  magnetUrl: string | null;
  infoUrl: string | null;
  indexer: string;
  seeders: number;
  leechers: number;
  categories: Array<{ id: number; name: string }>;
}

class ProwlarrClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl =
      process.env.PROWLARR_URL ?? "http://localhost:9696";
    this.apiKey = process.env.PROWLARR_API_KEY ?? "";
  }

  async search(query: string): Promise<ProwlarrResult[]> {
    const url = new URL(`${this.baseUrl}/api/v1/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("type", "search");

    const response = await fetch(url.toString(), {
      headers: {
        "X-Api-Key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Prowlarr search failed: ${response.status} ${text}`);
    }

    return response.json() as Promise<ProwlarrResult[]>;
  }
}

/* -------------------------------------------------------------------------- */
/*  Singletons                                                                */
/* -------------------------------------------------------------------------- */

let qbClient: QBittorrentClient | null = null;
function getQBClient(): QBittorrentClient {
  if (!qbClient) qbClient = new QBittorrentClient();
  return qbClient;
}

let prowlarrClient: ProwlarrClient | null = null;
function getProwlarrClient(): ProwlarrClient {
  if (!prowlarrClient) prowlarrClient = new ProwlarrClient();
  return prowlarrClient;
}

/* -------------------------------------------------------------------------- */
/*  Quality detection                                                         */
/* -------------------------------------------------------------------------- */

function detectQuality(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("2160p") || lower.includes("4k") || lower.includes("uhd"))
    return "uhd";
  if (lower.includes("1080p") || lower.includes("fullhd")) return "fullhd";
  if (lower.includes("720p")) return "hd";
  if (lower.includes("480p") || lower.includes("360p")) return "sd";
  return "unknown";
}

/* -------------------------------------------------------------------------- */
/*  Router                                                                    */
/* -------------------------------------------------------------------------- */

export const torrentRouter = createTRPCRouter({
  /**
   * Search for torrents via Prowlarr, building a search query from the
   * media item's title (+ season number if provided).
   */
  search: protectedProcedure
    .input(torrentSearchInput)
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.mediaId),
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media not found",
        });
      }

      // Build search query
      let query = row.title;
      if (input.seasonNumber !== undefined) {
        const padded = String(input.seasonNumber).padStart(2, "0");
        query += ` S${padded}`;
      }

      const prowlarr = getProwlarrClient();
      const results = await prowlarr.search(query);

      // Sort by seeders descending
      results.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));

      return results.map((r) => ({
        guid: r.guid,
        title: r.title,
        size: r.size,
        publishDate: r.publishDate,
        downloadUrl: r.downloadUrl,
        magnetUrl: r.magnetUrl,
        infoUrl: r.infoUrl,
        indexer: r.indexer,
        seeders: r.seeders,
        leechers: r.leechers,
        quality: detectQuality(r.title),
        categories: r.categories,
      }));
    }),

  /**
   * Send a magnet/torrent URL to qBittorrent and create a torrent DB record.
   */
  download: protectedProcedure
    .input(torrentDownloadInput)
    .mutation(async ({ ctx, input }) => {
      const magnetOrUrl = input.magnetUrl ?? input.torrentUrl;

      if (!magnetOrUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either magnetUrl or downloadUrl must be provided",
        });
      }

      const qb = getQBClient();
      await qb.addTorrent(magnetOrUrl);

      // Extract hash from magnet link if possible
      let hash: string | undefined;
      if (magnetOrUrl.startsWith("magnet:")) {
        const match = /xt=urn:btih:([a-fA-F0-9]+)/i.exec(magnetOrUrl);
        if (match?.[1]) {
          hash = match[1].toLowerCase();
        }
      }

      // Create torrent record
      const [inserted] = await ctx.db
        .insert(torrent)
        .values({
          hash,
          title: input.title,
          status: "downloading",
          quality: detectQuality(input.title),
        })
        .returning();

      return inserted;
    }),

  /**
   * List all torrent records from the database.
   */
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.torrent.findMany({
      orderBy: (t, { desc: d }) => [d(t.createdAt)],
    });
  }),

  /**
   * Cancel (pause) a torrent in qBittorrent.
   */
  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Torrent not found",
        });
      }

      if (row.hash) {
        const qb = getQBClient();
        await qb.pauseTorrent(row.hash);
      }

      const [updated] = await ctx.db
        .update(torrent)
        .set({ status: "error", updatedAt: new Date() })
        .where(eq(torrent.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Delete a torrent record from DB and optionally from qBittorrent.
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        deleteFiles: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.query.torrent.findFirst({
        where: eq(torrent.id, input.id),
      });

      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Torrent not found",
        });
      }

      // Remove from qBittorrent if hash is known
      if (row.hash) {
        try {
          const qb = getQBClient();
          await qb.deleteTorrent(row.hash, input.deleteFiles);
        } catch {
          // qBittorrent may not have this torrent anymore — that is okay
        }
      }

      await ctx.db.delete(torrent).where(eq(torrent.id, input.id));

      return { success: true };
    }),
});
