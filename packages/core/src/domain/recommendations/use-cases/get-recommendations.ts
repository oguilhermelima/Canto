import type { Database } from "@canto/db/client";
import type { MediaProviderPort } from "@canto/core/domain/shared/ports/media-provider.port";
import { buildExclusionSet } from "@canto/core/domain/recommendations/use-cases/recommendation-service";
import { applyMediaItemsLocalizationOverlay } from "@canto/core/domain/shared/localization/localization-service";
import { mapPoolItem } from "@canto/core/domain/shared/mappers/media-mapper";
import { rankByMmr } from "@canto/core/domain/recommendations/rules/mmr-diversity";
import {
  exploreSlotPositions,
  mixExploreSlots,
} from "@canto/core/domain/recommendations/rules/explore-mix";
import type { RecsFilters } from "@canto/core/domain/recommendations/types/recs-filters";
import {
  countUserRecommendations,
  findUserRecommendations,
} from "@canto/core/infra/recommendations/user-recommendation-repository";
import { makeMediaExtrasRepository } from "@canto/core/infra/content-enrichment/media-extras-repository.adapter";
import { findLibraryMediaBrief } from "@canto/core/infra/media/media-repository";

interface GetRecommendationsInput {
  userId: string;
  page: number;
  pageSize: number;
  filters: RecsFilters;
  userLang: string;
  recsVersion: number;
}

/**
 * λ used for the Maximal Marginal Relevance re-rank. 0.7 keeps relevance
 * dominant while breaking up genre clusters in the top of the list.
 */
const MMR_LAMBDA = 0.7;

/**
 * On the first page (only) we oversample 3× and re-rank with MMR for
 * genre diversity. Later pages use plain SQL offset — sortBy filters
 * also bypass MMR because relevance ordering is no longer the goal.
 */
const MMR_OVERSAMPLE = 3;

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
  const useMmr = page === 0 && !filters.sortBy;

  const extras = makeMediaExtrasRepository(db);
  const { excludeItems } = await buildExclusionSet(db, userId);

  // ── Path 1: Per-user recommendations ──
  // `countUserRecommendations` counts rows regardless of media enrichment
  // state, while `findUserRecommendations` filters out stubs. When the user
  // has recs that all point to light media, the count is positive but the
  // filtered query returns nothing — so fall through to the global pool
  // instead of returning an empty list.
  const userRecCount = await countUserRecommendations(db, userId);
  if (userRecCount > 0) {
    // The repo applies translation overlay inline via a LEFT JOIN on
    // `media_translation`, so we skip the post-query `translateMediaItems`
    // call — it would just re-resolve the same translation row.
    const fetchSize = useMmr ? pageSize * MMR_OVERSAMPLE + 1 : pageSize + 1;
    const rows = await findUserRecommendations(
      db,
      userId,
      excludeItems,
      fetchSize,
      offset,
      filters,
      userLang,
    );

    if (rows.length > 0) {
      const hasMore = rows.length > pageSize;
      const ranked = useMmr
        ? rankByMmr(
            rows.map((row) => ({ row, relevance: row.relevance, genreIds: row.genreIds ?? [] })),
            MMR_LAMBDA,
            pageSize,
          ).map((entry) => entry.row)
        : rows.slice(0, pageSize);
      const personalizedItems = ranked.map(mapPoolItem);

      // Explore slot: only on a full first page when MMR is in play.
      // Replaces a handful of personalised picks with global high-quality
      // items the user hasn't engaged with — keeps discovery alive without
      // the user paying for it via missed recs.
      const items =
        useMmr && personalizedItems.length === pageSize
          ? await mixWithExploreSlot(
              db,
              personalizedItems,
              excludeItems,
              userLang,
              filters,
            )
          : personalizedItems;

      return { items, nextCursor: hasMore ? page + 1 : null, version: recsVersion };
    }
  }

  // ── Path 2: Fallback to global pool ──
  const poolItems = await extras.findGlobalRecommendations(
    excludeItems,
    (pageSize + 1) * 3,
    offset,
    userLang,
    filters,
  );

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
    const ranked = useMmr
      ? rankByMmr(
          unique.map((item) => ({
            item,
            relevance: item.voteAverage ?? 0,
            genreIds: item.genreIds ?? [],
          })),
          MMR_LAMBDA,
          pageSize,
        ).map((entry) => entry.item)
      : unique.slice(0, pageSize);
    const items = ranked.map(mapPoolItem);
    const translatedPoolItems = await applyMediaItemsLocalizationOverlay(db, items, userLang);
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
  const translatedFallback = await applyMediaItemsLocalizationOverlay(db, pageItems, userLang);
  return { items: translatedFallback, nextCursor: hasMore ? page + 1 : null, version: recsVersion };
}

type MappedPoolItem = ReturnType<typeof mapPoolItem>;

/**
 * Pull a small global high-quality pool that excludes the personalised page
 * and the user's already-known items, then drop those picks into fixed
 * "explore" slots in the ranked list. Translates the explore items only —
 * the personalised ones already passed through the SQL translation overlay.
 */
async function mixWithExploreSlot(
  db: Database,
  personalized: MappedPoolItem[],
  excludeItems: Array<{ externalId: number; provider: string }>,
  userLang: string,
  filters: RecsFilters,
): Promise<MappedPoolItem[]> {
  const slots = exploreSlotPositions(personalized.length);
  if (slots.length === 0) return personalized;

  const personalizedExclude = personalized.map((item) => ({
    externalId: item.externalId,
    provider: item.provider,
  }));
  const exploreExcludes = [...excludeItems, ...personalizedExclude];

  // Pull 2× the slot count so we can dedup against `personalizedExclude`
  // even when the global pool has overlap with the personalised page.
  const pool = await makeMediaExtrasRepository(db).findGlobalRecommendations(
    exploreExcludes,
    slots.length * 2,
    0,
    userLang,
    filters,
  );
  if (pool.length === 0) return personalized;

  const seen = new Set(personalized.map((item) => `${item.provider}-${item.externalId}`));
  const explore: MappedPoolItem[] = [];
  for (const item of pool) {
    if (!item.posterPath) continue;
    const key = `${item.provider}-${item.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    explore.push(mapPoolItem(item));
    if (explore.length >= slots.length) break;
  }

  const translatedExplore = await applyMediaItemsLocalizationOverlay(db, explore, userLang);
  return mixExploreSlots(personalized, translatedExplore);
}
