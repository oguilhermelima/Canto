import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "../../shared/ports/media-provider.port";
import { buildExclusionSet } from "./recommendation-service";
import { translateMediaItems } from "../../shared/services/translation-service";
import { mapPoolItem } from "../../shared/mappers/media-mapper";
import {
  findUserRecommendations,
  countUserRecommendations,
  type RecsFilters,
} from "../../../infrastructure/repositories/recommendations/user-recommendation";
import {
  findGlobalRecommendations,
} from "../../../infrastructure/repositories/content-enrichment/extras";
import {
  findLibraryMediaBrief,
} from "../../../infrastructure/repositories/media/media-repository";

interface GetRecommendationsInput {
  userId: string;
  page: number;
  pageSize: number;
  filters: RecsFilters;
  userLang: string;
  recsVersion: number;
}

/**
 * Get per-user recommendations with 3-path fallback:
 * 1. Per-user pre-computed recs
 * 2. Global pool fallback
 * 3. Live TMDB fetch when pool is empty
 */
export async function getRecommendations(
  db: Database,
  input: GetRecommendationsInput,
  tmdb: MediaProviderPort,
) {
  const { userId, page, pageSize, filters, userLang, recsVersion } = input;
  const offset = page * pageSize;

  const { excludeItems } = await buildExclusionSet(db, userId);

  // ── Path 1: Per-user recommendations ──
  // `countUserRecommendations` counts rows regardless of media enrichment
  // state, while `findUserRecommendations` filters out stubs. When the user
  // has recs that all point to light media, the count is positive but the
  // filtered query returns nothing — so fall through to the global pool
  // instead of returning an empty list.
  const userRecCount = await countUserRecommendations(db, userId);
  if (userRecCount > 0) {
    const rows = await findUserRecommendations(
      db,
      userId,
      excludeItems,
      pageSize + 1,
      offset,
      filters,
    );

    if (rows.length > 0) {
      const hasMore = rows.length > pageSize;
      const items = rows.slice(0, pageSize).map(mapPoolItem);
      const translatedItems = await translateMediaItems(db, items, userLang);
      return { items: translatedItems, nextCursor: hasMore ? page + 1 : null, version: recsVersion };
    }
  }

  // ── Path 2: Fallback to global pool ──
  const poolItems = await findGlobalRecommendations(db, excludeItems, (pageSize + 1) * 3, offset, filters);

  if (poolItems.length > 0) {
    const seen = new Set<string>();
    const unique = poolItems.filter((item) => {
      if (!item.posterPath) return false;
      const key = `${item.provider}-${item.externalId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const hasMore = unique.length > pageSize;
    const items = unique.slice(0, pageSize).map(mapPoolItem);
    const translatedPoolItems = await translateMediaItems(db, items, userLang);
    return { items: translatedPoolItems, nextCursor: hasMore ? page + 1 : null, version: recsVersion };
  }

  // ── Path 3: Live TMDB fallback (pool completely empty) ──
  if (excludeItems.length === 0) return { items: [], nextCursor: null, version: recsVersion };

  const allLibrary = await findLibraryMediaBrief(db);
  const seedStart = (page * 3) % allLibrary.length;
  const seeds: typeof allLibrary = [];
  for (let i = 0; i < 3 && i < allLibrary.length; i++) {
    seeds.push(allLibrary[(seedStart + i) % allLibrary.length]!);
  }

  const libraryKeys = new Set(excludeItems.map((m) => `${m.provider}-${m.externalId}`));
  const seenKeys = new Set<string>();
  const results: Array<{
    externalId: number; provider: string; type: "movie" | "show";
    title: string; posterPath: string | null; backdropPath: string | null;
    year: number | undefined; voteAverage: number | undefined;
    overview: string | undefined; logoPath: string | null; trailerKey: string | null;
  }> = [];

  await Promise.all(
    seeds.map(async (item) => {
      try {
        const extras = await tmdb.getExtras(Number(item.externalId), item.type as "movie" | "show");
        for (const rec of extras.recommendations ?? []) {
          const key = `${rec.provider ?? "tmdb"}-${rec.externalId}`;
          if (libraryKeys.has(key) || seenKeys.has(key)) continue;
          seenKeys.add(key);
          results.push({
            externalId: rec.externalId, provider: rec.provider ?? "tmdb",
            type: (rec.type ?? item.type) as "movie" | "show",
            title: rec.title, posterPath: rec.posterPath ?? null,
            backdropPath: rec.backdropPath ?? null, year: rec.year,
            voteAverage: rec.voteAverage, overview: rec.overview,
            logoPath: null, trailerKey: null,
          });
        }
      } catch { /* skip failed seed */ }
    }),
  );

  const sorted = results.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
  const pageItems = sorted.slice(0, pageSize);
  const hasMore = sorted.length > pageSize || allLibrary.length > (page + 1) * 3;
  const translatedFallback = await translateMediaItems(db, pageItems, userLang);
  return { items: translatedFallback, nextCursor: hasMore ? page + 1 : null, version: recsVersion };
}
