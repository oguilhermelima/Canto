import { getSetting } from "@canto/db/settings";
import { SETTINGS } from "../../lib/settings-keys";
import type { IndexerResult } from "../../domain/types/torrent";

export class ProwlarrClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async search(query: string): Promise<IndexerResult[]> {
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

    return response.json() as Promise<IndexerResult[]>;
  }
}

/* Singleton */

let prowlarrClient: ProwlarrClient | null = null;

export async function getProwlarrClient(): Promise<ProwlarrClient> {
  if (!prowlarrClient) {
    const url = (await getSetting(SETTINGS.PROWLARR_URL)) ?? "";
    const apiKey = (await getSetting(SETTINGS.PROWLARR_API_KEY)) ?? "";
    prowlarrClient = new ProwlarrClient(url, apiKey);
  }
  return prowlarrClient;
}

export function resetProwlarrClient(): void {
  prowlarrClient = null;
}
