import { getSettings } from "@canto/db/settings";
import type { IndexerResult, SearchContext } from "../../../domain/torrents/types/torrent";
import type { IndexerPort } from "../../../domain/torrents/ports/indexer";
import { parseTorznabXml } from "./torznab-parser";

/* ── Indexer capability types ─────────────────────────────────────────────── */

interface IndexerCapability {
  id: number;
  name: string;
  language: string;
  tvSearch: boolean;
  tvSearchParams: string[];
  movieSearch: boolean;
  movieSearchParams: string[];
}

/* ── ProwlarrClient ───────────────────────────────────────────────────────── */

export class ProwlarrClient implements IndexerPort {
  private baseUrl: string;
  private apiKey: string;
  private cachedIndexers: IndexerCapability[] | null = null;
  private cachedAt = 0;
  private static CACHE_TTL = 60 * 60 * 1000; // 1 hour

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  /* ── Indexer discovery ──────────────────────────────────────────────────── */

  async fetchIndexers(): Promise<IndexerCapability[]> {
    const now = Date.now();
    if (this.cachedIndexers && now - this.cachedAt < ProwlarrClient.CACHE_TTL) {
      return this.cachedIndexers;
    }

    const response = await fetch(`${this.baseUrl}/api/v1/indexer`, {
      headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Prowlarr indexer list failed: ${response.status}`);
    }

    const indexers = (await response.json()) as Array<{
      id: number;
      name: string;
      language: string;
      enable: boolean;
      capabilities: {
        tvSearchParams?: string[];
        movieSearchParams?: string[];
      };
    }>;

    this.cachedIndexers = indexers
      .filter((idx) => idx.enable)
      .map((idx) => ({
        id: idx.id,
        name: idx.name ?? "unknown",
        language: idx.language ?? "en-US",
        tvSearch: (idx.capabilities.tvSearchParams?.length ?? 0) > 0,
        tvSearchParams: idx.capabilities.tvSearchParams ?? [],
        movieSearch: (idx.capabilities.movieSearchParams?.length ?? 0) > 0,
        movieSearchParams: idx.capabilities.movieSearchParams ?? [],
      }));

    this.cachedAt = now;
    console.log(
      `[prowlarr] Fetched ${this.cachedIndexers.length} indexer(s):`,
      this.cachedIndexers.map((i) => i.name).join(", "),
    );

    return this.cachedIndexers;
  }

  /* ── Per-indexer Newznab search ─────────────────────────────────────────── */

  /** Defaults (overridden by settings) */
  private static DEFAULT_TIMEOUT = 15_000;
  private static DEFAULT_CONCURRENCY = 5;
  private static DEFAULT_MAX_INDEXERS = 10;

  private async searchIndexer(
    indexer: IndexerCapability,
    params: Record<string, string>,
    timeoutMs: number,
  ): Promise<IndexerResult[]> {
    const url = new URL(`${this.baseUrl}/api/v1/indexer/${indexer.id}/newznab`);
    url.searchParams.set("apikey", this.apiKey);
    if (!params.limit) url.searchParams.set("limit", "10000");
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        headers: { "X-Api-Key": this.apiKey },
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(`[prowlarr] ${indexer.name}: failed ${response.status}`);
        return [];
      }

      const xml = await response.text();
      const results = parseTorznabXml(xml, indexer.name, indexer.language);
      console.log(`[prowlarr] ${indexer.name}: ${results.length} result(s)`);
      return results;
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        console.warn(`[prowlarr] ${indexer.name}: timeout (${timeoutMs}ms)`);
      } else {
        console.warn(`[prowlarr] ${indexer.name}: ${(err as Error).message}`);
      }
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /* ── Build per-indexer search params ────────────────────────────────────── */

  private buildSearchParams(
    indexer: IndexerCapability,
    ctx: SearchContext,
  ): Record<string, string> {
    const params: Record<string, string> = {};

    // Search type
    if (ctx.mediaType === "show") {
      params.t = "tvsearch";
    } else {
      params.t = "movie";
    }

    // Category
    if (ctx.categories?.length) {
      params.cat = ctx.categories.join(",");
    }

    // ID-based search: prefer tmdbid → imdbid → tvdbid → text fallback
    const searchParams =
      ctx.mediaType === "show"
        ? indexer.tvSearchParams
        : indexer.movieSearchParams;

    let hasIdParam = false;

    if (ctx.tmdbId && searchParams.includes("tmdbId")) {
      params.tmdbid = String(ctx.tmdbId);
      hasIdParam = true;
    } else if (ctx.imdbId && searchParams.includes("imdbId")) {
      params.imdbid = ctx.imdbId;
      hasIdParam = true;
    } else if (ctx.tvdbId && searchParams.includes("tvdbId")) {
      params.tvdbid = String(ctx.tvdbId);
      hasIdParam = true;
    }

    // Text query as fallback (or always for Jackett-style indexers)
    if (!hasIdParam) {
      params.q = ctx.query;
    }

    // Season parameter
    if (
      ctx.seasonNumber !== undefined &&
      searchParams.includes("season")
    ) {
      params.season = String(ctx.seasonNumber);

      // Episode parameter (only for single episode search)
      if (
        ctx.episodeNumbers?.length === 1 &&
        searchParams.includes("ep")
      ) {
        params.ep = String(ctx.episodeNumbers[0]);
      }
    }

    // Pagination (Torznab limit/offset)
    if (ctx.limit !== undefined) {
      params.limit = String(ctx.limit);
    }
    if (ctx.offset !== undefined) {
      params.offset = String(ctx.offset);
    }

    return params;
  }

  /* ── Main search: parallel per-indexer with concurrency limit ────────── */

  async search(ctx: SearchContext): Promise<IndexerResult[]> {
    // Read configurable limits from settings
    const {
      "search.maxIndexers": maxIndexersRaw,
      "search.timeout": timeoutRaw,
      "search.concurrency": concurrencyRaw,
    } = await getSettings([
      "search.maxIndexers",
      "search.timeout",
      "search.concurrency",
    ]);
    const maxIndexers = maxIndexersRaw ?? ProwlarrClient.DEFAULT_MAX_INDEXERS;
    const timeoutMs = timeoutRaw ?? ProwlarrClient.DEFAULT_TIMEOUT;
    const concurrency = concurrencyRaw ?? ProwlarrClient.DEFAULT_CONCURRENCY;

    const indexers = await this.fetchIndexers();

    let relevant =
      ctx.mediaType === "show"
        ? indexers.filter((i) => i.tvSearch)
        : indexers.filter((i) => i.movieSearch);

    if (relevant.length === 0) {
      console.warn(`[prowlarr] No ${ctx.mediaType} indexers available`);
      return [];
    }

    // Cap to max indexers setting
    if (relevant.length > maxIndexers) {
      relevant = relevant.slice(0, maxIndexers);
    }

    console.log(`[prowlarr] Searching ${relevant.length} indexer(s) (concurrency: ${concurrency}, timeout: ${timeoutMs}ms)`);

    // Search in batches to avoid overwhelming Prowlarr
    const results: IndexerResult[] = [];
    for (let i = 0; i < relevant.length; i += concurrency) {
      const batch = relevant.slice(i, i + concurrency);
      const settled = await Promise.allSettled(
        batch.map((indexer) => {
          const params = this.buildSearchParams(indexer, ctx);
          return this.searchIndexer(indexer, params, timeoutMs);
        }),
      );
      for (const s of settled) {
        if (s.status === "fulfilled") results.push(...s.value);
      }
    }

    return results;
  }

  /* ── RSS fetch (for RSS sync job) ──────────────────────────────────────── */

  async fetchRss(categories: number[]): Promise<IndexerResult[]> {
    const indexers = await this.fetchIndexers();
    const relevant = indexers.filter((i) => i.tvSearch);

    const fetches = relevant.map((indexer) =>
      this.searchIndexer(indexer, {
        t: "search",
        cat: categories.join(","),
        limit: "100",
      }, ProwlarrClient.DEFAULT_TIMEOUT),
    );

    const settled = await Promise.allSettled(fetches);
    const results: IndexerResult[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(...s.value);
    }
    return results;
  }
}

/* ── Singleton ────────────────────────────────────────────────────────────── */

let prowlarrClient: ProwlarrClient | null = null;

export async function getProwlarrClient(): Promise<ProwlarrClient> {
  if (!prowlarrClient) {
    const { "prowlarr.url": url, "prowlarr.apiKey": apiKey } = await getSettings([
      "prowlarr.url",
      "prowlarr.apiKey",
    ]);
    prowlarrClient = new ProwlarrClient(url ?? "", apiKey ?? "");
  }
  return prowlarrClient;
}

export function resetProwlarrClient(): void {
  prowlarrClient = null;
}
