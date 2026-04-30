import { desc, eq, and, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  getQualityFilters,
  getWeightedScoreOrder,
} from "@canto/core/domain/recommendations/rules/recommendation-filters";
import {
  engagementMultiplier,
  isNegativeSignal,
  type EngagementSignal,
} from "@canto/core/domain/recommendations/rules/engagement-signals";
import type { UserRecommendationRow } from "@canto/core/domain/recommendations/types/user-recommendation";

import type { Database } from "@canto/db/client";
import {
  list,
  listItem,
  media,
  mediaLocalization,
  mediaRecommendation,
} from "@canto/db/schema";
import {
  rebuildUserRecommendations,
  upsertUserRecommendations,
} from "@canto/core/infra/recommendations/user-recommendation-repository";
import { findUserEngagementStates } from "@canto/core/infra/user-media/state-repository";

const EN = "en-US";

/**
 * Aliased en-US `media_localization` row used by the rec-candidate selects.
 * Each query that references `recCandidateColumns` must LEFT JOIN this alias
 * on `(mediaId, language='en-US')` so the COALESCE-free columns resolve.
 */
const recLocEn = alias(mediaLocalization, "rec_loc_en");
const recLocEnJoin = and(
  eq(recLocEn.mediaId, media.id),
  eq(recLocEn.language, EN),
)!;

const MAX_SEEDS = 10;
const MAX_SEEDS_FROM_COLLECTIONS = 5;
const MAX_ENGAGEMENT_SEEDS = 5;
const MAX_SERVER_SOURCES = 10;
const MAX_POOL_RANK = 20;
const SERVER_BASE_WEIGHT = 0.4;
const COLLECTION_BASE_WEIGHT = 0.6;
const ENGAGEMENT_BASE_WEIGHT = 0.85;

/**
 * Columns we read from `media` in every seed-recommendation query so we can
 * persist them denormalized on `user_recommendation`. Centralized here so the
 * SELECT shape stays in lockstep across the watchlist / collection / server
 * paths. Per-language fields (title/overview/posterPath/logoPath) source
 * from the en-US `media_localization` row joined as `recLocEn`.
 */
const recCandidateColumns = {
  mediaId: mediaRecommendation.mediaId,
  externalId: media.externalId,
  provider: media.provider,
  type: media.type,
  title: recLocEn.title,
  overview: recLocEn.overview,
  posterPath: recLocEn.posterPath,
  backdropPath: media.backdropPath,
  logoPath: recLocEn.logoPath,
  voteAverage: media.voteAverage,
  year: media.year,
  releaseDate: media.releaseDate,
  genres: media.genres,
  genreIds: media.genreIds,
  runtime: media.runtime,
  originalLanguage: media.originalLanguage,
  contentRating: media.contentRating,
  status: media.status,
  popularity: media.popularity,
};

type RecCandidate = {
  mediaId: string;
  externalId: number;
  provider: string;
  type: string;
  title: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  voteAverage: number | null;
  year: number | null;
  releaseDate: string | null;
  genres: string[] | null;
  genreIds: number[] | null;
  runtime: number | null;
  originalLanguage: string | null;
  contentRating: string | null;
  status: string | null;
  popularity: number | null;
};

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
  // Group by primary genre (first genre), preserving addedAt order (already sorted newest first)
  const byGenre = new Map<string, string[]>();
  for (const item of items) {
    const genre = item.genres?.[0] ?? "Other";
    const bucket = byGenre.get(genre) ?? [];
    bucket.push(item.mediaId);
    byGenre.set(genre, bucket);
  }

  // Round-robin: pick 1 from each genre per round
  const seeds: string[] = [];
  const genreKeys = [...byGenre.keys()];
  const cursors = new Map<string, number>(genreKeys.map((g) => [g, 0]));

  while (seeds.length < limit) {
    let added = false;
    for (const genre of genreKeys) {
      if (seeds.length >= limit) break;
      const bucket = byGenre.get(genre)!;
      const cursor = cursors.get(genre)!;
      if (cursor < bucket.length) {
        seeds.push(bucket[cursor]!);
        cursors.set(genre, cursor + 1);
        added = true;
      }
    }
    if (!added) break; // all genres exhausted
  }

  return seeds;
}

interface ProcessSeedDeps {
  db: Database;
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

  const recItems = await deps.db
    .select(recCandidateColumns)
    .from(mediaRecommendation)
    .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
    .leftJoin(recLocEn, recLocEnJoin)
    .where(and(
      eq(mediaRecommendation.sourceMediaId, seedMediaId),
      ...getQualityFilters(),
    ))
    .orderBy(getWeightedScoreOrder())
    .limit(deps.rankCap);

  for (let rank = 0; rank < recItems.length; rank++) {
    const candidate = recItems[rank]!;
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
  db: Database,
  userId: string,
): Promise<void> {
  // 0. Engagement signals — used both to boost seeds and to exclude
  // dropped/disliked recs from the output.
  const engagementStates = await findUserEngagementStates(db, userId);
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
  const allUserItems = await db
    .select({
      mediaId: listItem.mediaId,
      genres: media.genres,
      listType: list.type,
    })
    .from(listItem)
    .innerJoin(list, eq(listItem.listId, list.id))
    .innerJoin(media, eq(listItem.mediaId, media.id))
    .where(
      and(
        eq(list.userId, userId),
        sql`${list.type} != 'server'`,
        sql`${listItem.deletedAt} IS NULL`,
      ),
    )
    .orderBy(desc(listItem.addedAt));

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
    db,
    rows,
    signalByMedia,
    negativeMedia,
    rankCap: MAX_POOL_RANK,
  };

  // 4. Watchlist seeds (primary)
  for (let pos = 0; pos < seedMediaIds.length; pos++) {
    await processSeed(seedMediaIds[pos]!, sourceWeight(pos), seedDeps);
  }

  // 5. Collection seeds (secondary, lower base weight)
  for (let pos = 0; pos < collectionSeedMediaIds.length; pos++) {
    const baseWeight =
      COLLECTION_BASE_WEIGHT * (1.0 - (pos / MAX_SEEDS_FROM_COLLECTIONS) * 0.4);
    await processSeed(collectionSeedMediaIds[pos]!, baseWeight, seedDeps);
  }

  // 6. Engagement-only seeds (between collection and server in priority)
  for (let pos = 0; pos < engagementSeedMediaIds.length; pos++) {
    const baseWeight =
      ENGAGEMENT_BASE_WEIGHT * (1.0 - (pos / MAX_ENGAGEMENT_SEEDS) * 0.4);
    await processSeed(engagementSeedMediaIds[pos]!, baseWeight, seedDeps);
  }

  // 7. Server library: include if user has few personal items
  let serverSourceCount = 0;
  const totalOwnSeeds =
    seedMediaIds.length
    + collectionSeedMediaIds.length
    + engagementSeedMediaIds.length;
  if (totalOwnSeeds < MAX_SEEDS) {
    const serverSources = await db
      .selectDistinct({ sourceMediaId: mediaRecommendation.sourceMediaId })
      .from(mediaRecommendation)
      .innerJoin(media, eq(mediaRecommendation.sourceMediaId, media.id))
      .where(eq(media.inLibrary, true))
      .limit(MAX_SERVER_SOURCES);

    serverSourceCount = serverSources.length;

    const serverDeps: ProcessSeedDeps = { ...seedDeps, rankCap: 8 };
    for (const source of serverSources) {
      await processSeed(source.sourceMediaId, SERVER_BASE_WEIGHT, serverDeps);
    }
  }

  // 8. Rebuild with granular weights (dedup keeps highest weight per mediaId)
  await rebuildUserRecommendations(db, userId, rows);

  const genreBreakdown = seedMediaIds.length > 0
    ? ` (seeds from ${new Set(watchlistItems.filter((i) => seedMediaIds.includes(i.mediaId)).map((i) => i.genres?.[0] ?? "Other")).size} genres)`
    : "";

  console.log(
    `[rebuild-user-recs] User ${userId}: ${seedMediaIds.length} watchlist + ${collectionSeedMediaIds.length} collection + ${engagementSeedMediaIds.length} engagement seeds${genreBreakdown}, ${rows.length} weighted recs, ${serverSourceCount} server sources, ${negativeMedia.size} excluded as negative`,
  );
}

/**
 * Lightweight additive update: add recommended media from a single source to the user's recs.
 * Does NOT delete existing recs — just upserts new ones on top.
 * Used reactively when user adds an item to a list.
 */
export async function addMediaToUserRecs(
  db: Database,
  userId: string,
  mediaId: string,
): Promise<void> {
  const recItems = await db
    .select(recCandidateColumns)
    .from(mediaRecommendation)
    .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
    .leftJoin(recLocEn, recLocEnJoin)
    .where(and(
      eq(mediaRecommendation.sourceMediaId, mediaId),
      ...getQualityFilters(),
    ))
    .orderBy(getWeightedScoreOrder())
    .limit(MAX_POOL_RANK);

  if (recItems.length === 0) return;

  // Skip recs the user has explicitly dropped or low-rated.
  const engagementStates = await findUserEngagementStates(db, userId);
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

  // New item gets top sourceWeight (position 0). Rank is preserved against
  // the original ordering — filtering negatives mid-flight would shift it.
  const rows: UserRecommendationRow[] = [];
  for (let rank = 0; rank < recItems.length; rank++) {
    const candidate = recItems[rank]!;
    if (negativeMedia.has(candidate.mediaId)) continue;
    rows.push(toRecRow(candidate, 1.0 * rankMultiplier(rank + 1)));
  }

  await upsertUserRecommendations(db, userId, rows);

  console.log(
    `[add-media-to-user-recs] User ${userId}: added ${rows.length} recs from media ${mediaId}`,
  );
}
