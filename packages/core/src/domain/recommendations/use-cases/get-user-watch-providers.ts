import type { Database } from "@canto/db/client";
import type { CachePort } from "@canto/core/domain/shared/ports/cache";
import type { RecommendationsCatalogPort } from "@canto/core/domain/recommendations/ports/recommendations-catalog.port";
import type { BrandedProvider } from "@canto/core/domain/recommendations/rules/canonical-brand";
import { getUserWatchPreferences } from "@canto/core/domain/shared/services/user-service";

const USER_WATCH_PROVIDERS_TTL_SECONDS = 24 * 60 * 60;

export type UserWatchProvidersResult = {
  region: string;
  providers: BrandedProvider[];
};

export interface GetUserWatchProvidersDeps {
  cache: CachePort;
  catalog: RecommendationsCatalogPort;
}

export async function getUserWatchProviders(
  deps: GetUserWatchProvidersDeps,
  db: Database,
  userId: string,
  overrideRegion?: string,
): Promise<UserWatchProvidersResult> {
  const region =
    overrideRegion ?? (await getUserWatchPreferences(db, userId)).watchRegion;
  return deps.cache.wrap(
    `user-watch-providers:v2:${region}`,
    USER_WATCH_PROVIDERS_TTL_SECONDS,
    async () => {
      const providers = await deps.catalog.listAllWatchProviders(region);
      return { region, providers };
    },
  );
}
