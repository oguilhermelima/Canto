import type { Database } from "@canto/db/client";
import { cached } from "../../../infrastructure/cache/redis";
import { fetchFromTmdb } from "../../../infrastructure/adapters/tmdb-raw";
import { canonicalBrand } from "../../rules/canonical-brand";
import { getUserWatchPreferences } from "../../services/user-service";

type RawProvider = {
  providerId: number;
  providerName: string;
  logoPath: string;
  displayPriority: number;
};

export type BrandedProvider = RawProvider & { providerIds: number[] };

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

async function fetchRegionProviders(region: string): Promise<RawProvider[]> {
  const [movieRes, tvRes] = await Promise.all([
    fetchFromTmdb<TmdbProvidersResponse>("/watch/providers/movie", { watch_region: region }),
    fetchFromTmdb<TmdbProvidersResponse>("/watch/providers/tv", { watch_region: region }),
  ]);

  const byId = new Map<number, RawProvider>();
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

function groupByBrand(providers: RawProvider[]): BrandedProvider[] {
  const byBrand = new Map<string, { flagship: RawProvider; ids: Set<number> }>();
  for (const p of providers) {
    const key = canonicalBrand(p.providerName);
    const existing = byBrand.get(key);
    if (!existing) {
      byBrand.set(key, { flagship: p, ids: new Set([p.providerId]) });
    } else {
      existing.ids.add(p.providerId);
      if (p.displayPriority < existing.flagship.displayPriority) {
        existing.flagship = p;
      }
    }
  }

  return Array.from(byBrand.values())
    .sort((a, b) => a.flagship.displayPriority - b.flagship.displayPriority)
    .map(({ flagship, ids }) => ({
      providerId: flagship.providerId,
      providerIds: Array.from(ids).sort((a, b) => a - b),
      providerName: flagship.providerName,
      logoPath: flagship.logoPath,
      displayPriority: flagship.displayPriority,
    }));
}

/**
 * Watch providers available in the user's region, grouped into canonical
 * brands so storefront variants ("Apple TV+", "Apple TV Store", "Apple TV
 * Channel") collapse into one tile whose `providerIds` matches every
 * underlying TMDB id.
 *
 * v2 cache key: payload shape changed from single providerId to
 * providerIds[]. The version prefix invalidates v1 payloads that would
 * break older clients.
 */
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
