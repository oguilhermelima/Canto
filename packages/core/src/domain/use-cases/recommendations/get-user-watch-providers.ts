import type { Database } from "@canto/db/client";
import { cached } from "../../../infrastructure/cache/redis";
import { fetchFromTmdb } from "../../../infrastructure/adapters/tmdb-raw";
import {
  groupByBrand,
  type BrandedProvider,
  type WatchProvider,
} from "../../rules/canonical-brand";
import { getUserWatchPreferences } from "../../services/user-service";

export type UserWatchProvidersResult = {
  region: string;
  providers: BrandedProvider[];
};

interface TmdbProvidersResponse {
  results: Array<{
    provider_id: number;
    provider_name: string;
    logo_path: string;
    display_priority: number;
  }>;
}

async function fetchRegionProviders(region: string): Promise<WatchProvider[]> {
  const [movieRes, tvRes] = await Promise.all([
    fetchFromTmdb<TmdbProvidersResponse>("/watch/providers/movie", { watch_region: region }),
    fetchFromTmdb<TmdbProvidersResponse>("/watch/providers/tv", { watch_region: region }),
  ]);

  const byId = new Map<number, WatchProvider>();
  for (const p of [...movieRes.results, ...tvRes.results]) {
    const priority = p.display_priority;
    const prev = byId.get(p.provider_id);
    if (!prev || priority < prev.displayPriority) {
      byId.set(p.provider_id, {
        providerId: p.provider_id,
        providerName: p.provider_name,
        logoPath: p.logo_path,
        displayPriority: priority,
      });
    }
  }
  return Array.from(byId.values());
}

export async function getUserWatchProviders(
  db: Database,
  userId: string,
  overrideRegion?: string,
): Promise<UserWatchProvidersResult> {
  const region = overrideRegion ?? (await getUserWatchPreferences(db, userId)).watchRegion;
  return cached(`user-watch-providers:v2:${region}`, 86400, async () => {
    const providers = await fetchRegionProviders(region);
    return { region, providers: groupByBrand(providers) };
  });
}
