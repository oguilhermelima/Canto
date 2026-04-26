import { desc, eq, and, sql } from "drizzle-orm";
import { getQualityFilters, getWeightedScoreOrder } from "../rules/recommendation-filters";

import type { Database } from "@canto/db/client";
import {
  list,
  listItem,
  media,
  mediaRecommendation,
} from "@canto/db/schema";
import {
  rebuildUserRecommendations,
  upsertUserRecommendations,
  type UserRecommendationRow,
} from "../../../infra/recommendations/user-recommendation-repository";

const MAX_SEEDS = 10;
const MAX_SEEDS_FROM_COLLECTIONS = 5;
const MAX_SERVER_SOURCES = 10;
const MAX_POOL_RANK = 20;
const SERVER_BASE_WEIGHT = 0.4;
const COLLECTION_BASE_WEIGHT = 0.6;

/**
 * Columns we read from `media` in every seed-recommendation query so we can
 * persist them denormalized on `user_recommendation`. Centralized here so the
 * SELECT shape stays in lockstep across the watchlist / collection / server
 * paths.
 */
const recCandidateColumns = {
  mediaId: mediaRecommendation.mediaId,
  externalId: media.externalId,
  provider: media.provider,
  type: media.type,
  title: media.title,
  posterPath: media.posterPath,
  backdropPath: media.backdropPath,
  logoPath: media.logoPath,
  voteAverage: media.voteAverage,
  year: media.year,
  releaseDate: media.releaseDate,
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
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  logoPath: string | null;
  voteAverage: number | null;
  year: number | null;
  releaseDate: string | null;
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
    title: candidate.title,
    posterPath: candidate.posterPath,
    backdropPath: candidate.backdropPath,
    logoPath: candidate.logoPath,
    voteAverage: candidate.voteAverage,
    year: candidate.year,
    releaseDate: candidate.releaseDate,
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

/**
 * Rebuild per-user recommendations with granular weights.
 *
 * Sources (in priority order):
 * 1. User's watchlist items (primary) via genre round-robin (max 10 seeds)
 * 2. User's collection items (secondary) for additional diversity (max 5 seeds)
 * 3. Server library items (if user has few personal items)
 *
 * Weight = sourceWeight(seedPosition) × rankMultiplier(recRank)
 */
export async function rebuildUserRecs(
  db: Database,
  userId: string,
): Promise<void> {
  // 1. Get all user list items with genres (newest first)
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
      ),
    )
    .orderBy(desc(listItem.addedAt));

  // Separate watchlist from collections
  const watchlistItems = allUserItems.filter((i) => i.listType === "watchlist");
  const collectionItems = allUserItems.filter((i) => i.listType !== "watchlist");

  // 2. Select diverse seeds: watchlist primary, collections secondary
  const seedMediaIds = selectSeeds(watchlistItems, MAX_SEEDS);
  const collectionSeedMediaIds = selectSeeds(
    collectionItems,
    Math.min(MAX_SEEDS_FROM_COLLECTIONS, MAX_SEEDS - seedMediaIds.length),
  );

  const rows: UserRecommendationRow[] = [];

  // 3. Process watchlist seeds (primary source)
  for (let pos = 0; pos < seedMediaIds.length; pos++) {
    const sw = sourceWeight(pos);
    const recItems = await db
      .select(recCandidateColumns)
      .from(mediaRecommendation)
      .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
      .where(and(
        eq(mediaRecommendation.sourceMediaId, seedMediaIds[pos]!),
        ...getQualityFilters(),
      ))
      .orderBy(getWeightedScoreOrder())
      .limit(MAX_POOL_RANK);

    for (let rank = 0; rank < recItems.length; rank++) {
      rows.push(toRecRow(recItems[rank]!, sw * rankMultiplier(rank + 1)));
    }
  }

  // 4. Process collection seeds (secondary source, lower base weight)
  for (let pos = 0; pos < collectionSeedMediaIds.length; pos++) {
    const sw = COLLECTION_BASE_WEIGHT * (1.0 - (pos / MAX_SEEDS_FROM_COLLECTIONS) * 0.4);
    const recItems = await db
      .select(recCandidateColumns)
      .from(mediaRecommendation)
      .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
      .where(and(
        eq(mediaRecommendation.sourceMediaId, collectionSeedMediaIds[pos]!),
        ...getQualityFilters(),
      ))
      .orderBy(getWeightedScoreOrder())
      .limit(MAX_POOL_RANK);

    for (let rank = 0; rank < recItems.length; rank++) {
      rows.push(toRecRow(recItems[rank]!, sw * rankMultiplier(rank + 1)));
    }
  }

  // 5. Server library: include if user has few items
  let serverSourceCount = 0;
  const totalOwnSeeds = seedMediaIds.length + collectionSeedMediaIds.length;
  if (totalOwnSeeds < MAX_SEEDS) {
    const serverSources = await db
      .selectDistinct({ sourceMediaId: mediaRecommendation.sourceMediaId })
      .from(mediaRecommendation)
      .innerJoin(media, eq(mediaRecommendation.sourceMediaId, media.id))
      .where(eq(media.inLibrary, true))
      .limit(MAX_SERVER_SOURCES);

    serverSourceCount = serverSources.length;

    for (const source of serverSources) {
      const recItems = await db
        .select(recCandidateColumns)
        .from(mediaRecommendation)
        .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
        .where(and(
          eq(mediaRecommendation.sourceMediaId, source.sourceMediaId),
          ...getQualityFilters(),
        ))
        .orderBy(getWeightedScoreOrder())
        .limit(8);

      for (let rank = 0; rank < recItems.length; rank++) {
        rows.push(toRecRow(recItems[rank]!, SERVER_BASE_WEIGHT * rankMultiplier(rank + 1)));
      }
    }
  }

  // 6. Rebuild with granular weights (dedup keeps highest weight per mediaId)
  await rebuildUserRecommendations(db, userId, rows);

  const genreBreakdown = seedMediaIds.length > 0
    ? ` (seeds from ${new Set(watchlistItems.filter((i) => seedMediaIds.includes(i.mediaId)).map((i) => i.genres?.[0] ?? "Other")).size} genres)`
    : "";

  console.log(
    `[rebuild-user-recs] User ${userId}: ${seedMediaIds.length} watchlist + ${collectionSeedMediaIds.length} collection seeds${genreBreakdown}, ${rows.length} weighted recs, ${serverSourceCount} server sources`,
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
    .where(and(
      eq(mediaRecommendation.sourceMediaId, mediaId),
      ...getQualityFilters(),
    ))
    .orderBy(getWeightedScoreOrder())
    .limit(MAX_POOL_RANK);

  if (recItems.length === 0) return;

  // New item gets top sourceWeight (position 0)
  const rows = recItems.map((p, rank) => toRecRow(p, 1.0 * rankMultiplier(rank + 1)));

  await upsertUserRecommendations(db, userId, rows);

  console.log(
    `[add-media-to-user-recs] User ${userId}: added ${rows.length} recs from media ${mediaId}`,
  );
}
