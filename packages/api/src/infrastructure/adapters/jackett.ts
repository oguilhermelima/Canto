import { XMLParser } from "fast-xml-parser";
import { getSetting } from "@canto/db/settings";
import type { IndexerResult } from "../../domain/types/torrent";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export class JackettClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async search(query: string): Promise<IndexerResult[]> {
    const url = new URL(
      `${this.baseUrl}/api/v2.0/indexers/all/results/torznab/api`,
    );
    url.searchParams.set("apikey", this.apiKey);
    url.searchParams.set("t", "search");
    url.searchParams.set("q", query);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Jackett search failed: ${response.status}`);
    }

    const xml = await response.text();
    return this.parseResults(xml);
  }

  private parseResults(xml: string): IndexerResult[] {
    const parsed = xmlParser.parse(xml);
    const channel = parsed?.rss?.channel;
    if (!channel?.item) return [];

    const items = Array.isArray(channel.item) ? channel.item : [channel.item];

    return items.map((item: Record<string, unknown>): IndexerResult => {
      const attrs = this.getTorznabAttrs(item);
      const seeders = parseInt(attrs.seeders ?? "0", 10);
      const peers = parseInt(attrs.peers ?? "0", 10);
      const pubDate = (item.pubDate as string) ?? "";
      const ageMs = pubDate ? Date.now() - new Date(pubDate).getTime() : 0;

      return {
        guid: String(item.guid ?? item.link ?? ""),
        title: String(item.title ?? ""),
        size: parseInt(String(item.size ?? attrs.size ?? "0"), 10),
        publishDate: pubDate,
        downloadUrl: (item.link as string) ?? null,
        magnetUrl: (attrs.magneturl as string) ?? null,
        infoUrl: (item.comments as string) ?? null,
        indexer: (item.jackettindexer as string) ?? "Jackett",
        seeders,
        leechers: Math.max(0, peers - seeders),
        age: Math.floor(ageMs / (1000 * 60 * 60 * 24)),
        indexerFlags: [],
        categories: this.parseCategories(item),
      };
    });
  }

  private getTorznabAttrs(
    item: Record<string, unknown>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const attrs = (item["torznab:attr"] ?? item["newznab:attr"]) as
      | Record<string, string>
      | Record<string, string>[]
      | undefined;
    if (!attrs) return result;
    const list = Array.isArray(attrs) ? attrs : [attrs];
    for (const a of list) {
      if (a["@_name"] && a["@_value"]) {
        result[a["@_name"].toLowerCase()] = a["@_value"];
      }
    }
    return result;
  }

  private parseCategories(
    item: Record<string, unknown>,
  ): Array<{ id: number; name: string }> {
    const cats: Array<{ id: number; name: string }> = [];
    const category = item.category;
    if (!category) return cats;
    const list = Array.isArray(category) ? category : [category];
    for (const c of list) {
      const id = parseInt(String(c), 10);
      if (!isNaN(id)) cats.push({ id, name: String(c) });
    }
    return cats;
  }
}

/* Singleton */

let jackettClient: JackettClient | null = null;

export async function getJackettClient(): Promise<JackettClient> {
  if (!jackettClient) {
    const url = (await getSetting("jackett.url")) ?? "";
    const apiKey = (await getSetting("jackett.apiKey")) ?? "";
    jackettClient = new JackettClient(url, apiKey);
  }
  return jackettClient;
}

export function resetJackettClient(): void {
  jackettClient = null;
}
