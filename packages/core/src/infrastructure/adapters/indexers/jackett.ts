import { getSettings } from "@canto/db/settings";
import type { IndexerResult, SearchContext } from "../../../domain/torrents/types/torrent";
import type { IndexerPort } from "../../../domain/torrents/ports/indexer";
import { parseTorznabXml } from "./torznab-parser";

export class JackettClient implements IndexerPort {
  private baseUrl: string;
  private apiKey: string;
  private static DEFAULT_TIMEOUT_MS = 15_000;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async search(ctx: SearchContext): Promise<IndexerResult[]> {
    const url = new URL(
      `${this.baseUrl}/api/v2.0/indexers/all/results/torznab/api`,
    );
    url.searchParams.set("apikey", this.apiKey);
    url.searchParams.set("t", "search");
    url.searchParams.set("q", ctx.query);

    // Category filter
    if (ctx.categories?.length) {
      url.searchParams.set("cat", ctx.categories.join(","));
    }

    // Pagination
    if (ctx.limit !== undefined) {
      url.searchParams.set("limit", String(ctx.limit));
    }
    if (ctx.offset !== undefined) {
      url.searchParams.set("offset", String(ctx.offset));
    }

    // Respect the admin-configured search.timeout; fall back if unset so
    // a Jackett instance that takes forever can't block the whole job queue.
    const { "search.timeout": timeoutRaw } = await getSettings(["search.timeout"]);
    const timeoutMs = timeoutRaw ?? JackettClient.DEFAULT_TIMEOUT_MS;

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Jackett search failed: ${response.status}`);
    }

    const xml = await response.text();
    return parseTorznabXml(xml, "Jackett");
  }
}

/* Singleton */

let jackettClient: JackettClient | null = null;

export async function getJackettClient(): Promise<JackettClient> {
  if (!jackettClient) {
    const { "jackett.url": url, "jackett.apiKey": apiKey } = await getSettings([
      "jackett.url",
      "jackett.apiKey",
    ]);
    jackettClient = new JackettClient(url ?? "", apiKey ?? "");
  }
  return jackettClient;
}

export function resetJackettClient(): void {
  jackettClient = null;
}
