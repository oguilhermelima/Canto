import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import type { IndexerResult, SearchContext } from "../../domain/types/torrent";
import { parseTorznabXml } from "./torznab-parser";

export class JackettClient {
  private baseUrl: string;
  private apiKey: string;

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

    const response = await fetch(url.toString());
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
    const url = (await getSetting(SETTINGS.JACKETT_URL)) ?? "";
    const apiKey = (await getSetting(SETTINGS.JACKETT_API_KEY)) ?? "";
    jackettClient = new JackettClient(url, apiKey);
  }
  return jackettClient;
}

export function resetJackettClient(): void {
  jackettClient = null;
}
