import type { RecommendationsRepositoryPort } from "@canto/core/domain/recommendations/ports/recommendations-repository.port";
import type { UserMediaRepositoryPort } from "@canto/core/domain/user-media/ports/user-media-repository.port";
import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import {
  engagementMultiplier,
  isNegativeSignal,
} from "@canto/core/domain/recommendations/rules/engagement-signals";
import type { EngagementSignal } from "@canto/core/domain/recommendations/rules/engagement-signals";
import type { UserRecommendationRow } from "@canto/core/domain/recommendations/types/user-recommendation";

const MAX_SEEDS = 10;
const MAX_SEEDS_FROM_COLLECTIONS = 5;
const MAX_ENGAGEMENT_SEEDS = 5;
const MAX_SERVER_SOURCES = 10;
const MAX_POOL_RANK = 20;
const SERVER_BASE_WEIGHT = 0.4;
const COLLECTION_BASE_WEIGHT = 0.6;
const ENGAGEMENT_BASE_WEIGHT = 0.85;

export interface RebuildUserRecsDeps {
  recs: RecommendationsRepositoryPort;
  userMedia: UserMediaRepositoryPort;
  logger: LoggerPort;
}

type RecCandidate = Awaited<
  ReturnType<RecommendationsRepositoryPort["findRecCandidatesForSeed"]>
>[number];

function toRecRow(candidate: RecCandidate, weight: number): UserRecommendationRow {
  return {
    mediaId: candidate.mediaId,
    weight,
    externalId: candidate.externalId,
    provider: candidate.provider,
    type: candidate.type,
    title: candidate.title ?? "",
    overview: candidate.overview,
    posterPath: candidate.posterPath,
    backdropPath: candidate.backdropPath,
    logoPath: candidate.logoPath,
    voteAverage: candidate.voteAverage,
    year: candidate.year,
    releaseDate: candidate.releaseDate,
    genres: candidate.genres,
    genreIds: candidate.genreIds,
    runtime: candidate.runtime,
    originalLanguage: candidate.originalLanguage,
    contentRating: candidate.contentRating,
    status: candidate.status,
    popularity: candidate.popularity,
  };
}

/**
 * Weight multiplier based on rank within a source's recommendation items.
 * Favors diversity by giving good weight to mid-rank items (3-12).
 * Rank 1-3: 1.0 (top picks), Rank 4-12: 0.7 (good diversity), Rank 13-20: 0.35 (deeper)
 */
function rankMultiplier(rank: number): number {
  if (rank <= 3) return 1.0;
  if (rank <= 12) return 0.7;
  if (rank <= 20) return 0.35;
  return 0.15;
}

/**
 * Weight based on seed position (0 = highest priority seed).
 * Position 0 → 1.0, position MAX-1 → 0.42
 */
function sourceWeight(position: number): number {
  return 1.0 - (position / MAX_SEEDS) * 0.65;
}

/**
 * Select seeds via genre round-robin for diversity.
 * Groups user's list items by primary genre, then picks one from each genre
 * in rotation until the seed limit is reached. Newest items within each
 * genre are picked first.
 */
function selectSeeds(
  items: Array<{ mediaId: string; genres: string[] | null }>,
  limit: number,
): string[] {
  const byGenre = new Map<string, string[]>();
  for (const item of items) {
    const genre = item.genres?.[0] ?? "Other";
    const bucket = byGenre.get(genre) ?? [];
    bucket.push(item.mediaId);
    byGenre.set(genre, bucket);
  }

  const seeds: string[] = [];
  const genreKeys = [...byGenre.keys()];
  const cursors = new Map<string, number>(genreKeys.map((g) => [g, 0]));

  while (seeds.length < limit) {
    let added = false;
    for (const genre of genreKeys) {
      if (seeds.length >= limit) break;
      const bucket = byGenre.get(genre);
      const cursor = cursors.get(genre);
      if (bucket === undefined || cursor === undefined) continue;
      const next = bucket[cursor];
      if (next !== undefined) {
        seeds.push(next);
        cursors.set(genre, cursor + 1);
        added = true;
      }
    }
    if (!added) break;
  }

  return seeds;
}

interface ProcessSeedDeps {
  recs: RecommendationsRepositoryPort;
  rows: UserRecommendationRow[];
  signalByMedia: Map<string, EngagementSignal>;
  negativeMedia: Set<string>;
  rankCap: number;
}

/**
 * Resolve recs for a single seed and append weighted rows. Skips recs the
 * user has explicitly disliked (dropped / rating ≤ 3). Boosts weight when
 * the seed itself carries a positive engagement signal.
 */
async function processSeed(
  seedMediaId: string,
  baseWeight: number,
  deps: ProcessSeedDeps,
): Promise<void> {
  const seedSignal = deps.signalByMedia.get(seedMediaId);
  const seedBoost = seedSignal ? engagementMultiplier(seedSignal) : 1.0;

  const recItems = await deps.recs.findRecCandidatesForSeed(
    seedMediaId,
    deps.rankCap,
  );

  for (const [rank, candidate] of recItems.entries()) {
    if (deps.negativeMedia.has(candidate.mediaId)) continue;
    deps.rows.push(
      toRecRow(candidate, baseWeight * seedBoost * rankMultiplier(rank + 1)),
    );
  }
}

/**
 * Engagement-only seeds: media the user has watched / rated / favorited but
 * never added to a list. Sorted by recency of engagement, capped at
 * MAX_ENGAGEMENT_SEEDS, and excluding anything already used as a watchlist
 * or collection seed.
 */
function selectEngagementSeeds(
  signalByMedia: Map<string, EngagementSignal>,
  updatedAtByMedia: Map<string, Date>,
  alreadySeeded: Set<string>,
  limit: number,
): string[] {
  const candidates: Array<{ mediaId: string; updatedAt: Date }> = [];
  for (const [mediaId, signal] of signalByMedia) {
    if (alreadySeeded.has(mediaId)) continue;
    if (engagementMultiplier(signal) <= 1.0) continue;
    const updatedAt = updatedAtByMedia.get(mediaId);
    if (!updatedAt) continue;
    candidates.push({ mediaId, updatedAt });
  }
  candidates.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return candidates.slice(0, limit).map((c) => c.mediaId);
}

/**
 * Rebuild per-user recommendations with granular weights.
 *
 * Sources (in priority order):
 * 1. User's watchlist items (primary) via genre round-robin (max 10 seeds)
 * 2. User's collection items (secondary) for additional diversity (max 5 seeds)
 * 3. Engagement-only items: watched / rated / favorited but not in any list (max 5 seeds)
 * 4. Server library items (if user has few personal items)
 *
 * Weight = sourceWeight × engagementBoost(seed) × rankMultiplier(recRank).
 * Recs derived from a seed the user rated highly or marked favorite get a
 * stronger weight; recs that point to dropped/disliked media are excluded.
 */
export async function rebuildUserRecs(
  deps: RebuildUserRecsDeps,
  userId: string,
): Promise<void> {
  // 0. Engagement signals — used both to boost seeds and to exclude
  // dropped/disliked recs from the output.
  const engagementStates = await deps.userMedia.findEngagementStates(userId);
  const signalByMedia = new Map<string, EngagementSignal>();
  const updatedAtByMedia = new Map<string, Date>();
  const negativeMedia = new Set<string>();
  for (const state of engagementStates) {
    const signal: EngagementSignal = {
      status: state.status,
      rating: state.rating,
      isFavorite: state.isFavorite,
    };
    signalByMedia.set(state.mediaId, signal);
    updatedAtByMedia.set(state.mediaId, state.updatedAt);
    if (isNegativeSignal(signal)) negativeMedia.add(state.mediaId);
  }

  // 1. Get all user list items with genres (newest first), excluding any
  // mediaIds the user has explicitly dropped or rated low.
  const allUserItems = await deps.recs.findUserListItemsForRecs(userId);
  const filteredItems = allUserItems.filter(
    (item) => !negativeMedia.has(item.mediaId),
  );

  // Separate watchlist from collections
  const watchlistItems = filteredItems.filter((i) => i.listType === "watchlist");
  const collectionItems = filteredItems.filter((i) => i.listType !== "watchlist");

  // 2. Select diverse seeds: watchlist primary, collections secondary
  const seedMediaIds = selectSeeds(watchlistItems, MAX_SEEDS);
  const collectionSeedMediaIds = selectSeeds(
    collectionItems,
    Math.min(MAX_SEEDS_FROM_COLLECTIONS, MAX_SEEDS - seedMediaIds.length),
  );

  const seededSet = new Set<string>([
    ...seedMediaIds,
    ...collectionSeedMediaIds,
  ]);

  // 3. Engagement-only seeds: media the user watched/rated/favorited but
  // never added to a list.
  const engagementSeedMediaIds = selectEngagementSeeds(
    signalByMedia,
    updatedAtByMedia,
    seededSet,
    MAX_ENGAGEMENT_SEEDS,
  );

  const rows: UserRecommendationRow[] = [];
  const seedDeps: ProcessSeedDeps = {
    recs: deps.recs,
    rows,
    signalByMedia,
    negativeMedia,
    rankCap: MAX_POOL_RANK,
  };

  // 4. Watchlist seeds (primary)
  for (const [pos, mediaId] of seedMediaIds.entries()) {
    await processSeed(mediaId, sourceWeight(pos), seedDeps);
  }

  // 5. Collection seeds (secondary, lower base weight)
  for (const [pos, mediaId] of collectionSeedMediaIds.entries()) {
    const baseWeight =
      COLLECTION_BASE_WEIGHT * (1.0 - (pos / MAX_SEEDS_FROM_COLLECTIONS) * 0.4);
    await processSeed(mediaId, baseWeight, seedDeps);
  }

  // 6. Engagement-only seeds (between collection and server in priority)
  for (const [pos, mediaId] of engagementSeedMediaIds.entries()) {
    const baseWeight =
      ENGAGEMENT_BASE_WEIGHT * (1.0 - (pos / MAX_ENGAGEMENT_SEEDS) * 0.4);
    await processSeed(mediaId, baseWeight, seedDeps);
  }

  // 7. Server library: include if user has few personal items
  let serverSourceCount = 0;
  const totalOwnSeeds =
    seedMediaIds.length
    + collectionSeedMediaIds.length
    + engagementSeedMediaIds.length;
  if (totalOwnSeeds < MAX_SEEDS) {
    const serverSources = await deps.recs.findServerRecSources(MAX_SERVER_SOURCES);
    serverSourceCount = serverSources.length;

    const serverDeps: ProcessSeedDeps = { ...seedDeps, rankCap: 8 };
    for (const source of serverSources) {
      await processSeed(source.sourceMediaId, SERVER_BASE_WEIGHT, serverDeps);
    }
  }

  // 8. Rebuild with granular weights (dedup keeps highest weight per mediaId)
  await deps.recs.rebuildUserRecommendations(userId, rows);

  const genreBreakdown = seedMediaIds.length > 0
    ? ` (seeds from ${new Set(watchlistItems.filter((i) => seedMediaIds.includes(i.mediaId)).map((i) => i.genres?.[0] ?? "Other")).size} genres)`
    : "";

  deps.logger.info?.(
    `[rebuild-user-recs] User ${userId}: ${seedMediaIds.length} watchlist + ${collectionSeedMediaIds.length} collection + ${engagementSeedMediaIds.length} engagement seeds${genreBreakdown}, ${rows.length} weighted recs, ${serverSourceCount} server sources, ${negativeMedia.size} excluded as negative`,
  );
}

/**
 * Lightweight additive update: add recommended media from a single source to the user's recs.
 * Does NOT delete existing recs — just upserts new ones on top.
 * Used reactively when user adds an item to a list.
 */
export async function addMediaToUserRecs(
  deps: RebuildUserRecsDeps,
  userId: string,
  mediaId: string,
): Promise<void> {
  const recItems = await deps.recs.findRecCandidatesForSeed(mediaId, MAX_POOL_RANK);
  if (recItems.length === 0) return;

  const engagementStates = await deps.userMedia.findEngagementStates(userId);
  const negativeMedia = new Set<string>();
  for (const state of engagementStates) {
    if (
      isNegativeSignal({
        status: state.status,
        rating: state.rating,
        isFavorite: state.isFavorite,
      })
    ) {
      negativeMedia.add(state.mediaId);
    }
  }

  const rows: UserRecommendationRow[] = [];
  for (let rank = 0; rank < recItems.length; rank++) {
    const candidate = recItems[rank]!;
    if (negativeMedia.has(candidate.mediaId)) continue;
    rows.push(toRecRow(candidate, 1.0 * rankMultiplier(rank + 1)));
  }

  await deps.recs.upsertUserRecommendations(userId, rows);

  deps.logger.info?.(
    `[add-media-to-user-recs] User ${userId}: added ${rows.length} recs from media ${mediaId}`,
  );
}
