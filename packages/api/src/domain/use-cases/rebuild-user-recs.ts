import { desc, eq, and, sql } from "drizzle-orm";

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
} from "../../infrastructure/repositories/user-recommendation-repository";

const MAX_SEEDS = 10;
const MAX_SERVER_SOURCES = 10;
const MAX_POOL_RANK = 15;
const SERVER_BASE_WEIGHT = 0.3;

/**
 * Weight multiplier based on rank within a source's recommendation items.
 * Top picks get full weight, deeper recommendations get much less.
 */
function rankMultiplier(rank: number): number {
  if (rank <= 5) return 1.0;
  if (rank <= 15) return 0.3;
  return 0.1;
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
 * Seeds are selected via genre round-robin (max 10) to ensure diversity.
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

  // 2. Select diverse seeds via genre round-robin
  const seedMediaIds = selectSeeds(allUserItems, MAX_SEEDS);

  const rows: Array<{ mediaId: string; weight: number }> = [];

  // 3. For each seed, get recommended media IDs ranked by vote_average and assign weighted recs
  for (let pos = 0; pos < seedMediaIds.length; pos++) {
    const sw = sourceWeight(pos);
    const recItems = await db
      .select({ mediaId: mediaRecommendation.mediaId })
      .from(mediaRecommendation)
      .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
      .where(eq(mediaRecommendation.sourceMediaId, seedMediaIds[pos]!))
      .orderBy(desc(media.voteAverage))
      .limit(MAX_POOL_RANK);

    for (let rank = 0; rank < recItems.length; rank++) {
      rows.push({
        mediaId: recItems[rank]!.mediaId,
        weight: sw * rankMultiplier(rank + 1),
      });
    }
  }

  // 4. Server library: only if user has fewer than MAX_SEEDS personal items
  let serverSourceCount = 0;
  if (seedMediaIds.length < MAX_SEEDS) {
    const serverSources = await db
      .selectDistinct({ sourceMediaId: mediaRecommendation.sourceMediaId })
      .from(mediaRecommendation)
      .innerJoin(media, eq(mediaRecommendation.sourceMediaId, media.id))
      .where(eq(media.downloaded, true))
      .limit(MAX_SERVER_SOURCES);

    serverSourceCount = serverSources.length;

    for (const source of serverSources) {
      const recItems = await db
        .select({ mediaId: mediaRecommendation.mediaId })
        .from(mediaRecommendation)
        .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
        .where(eq(mediaRecommendation.sourceMediaId, source.sourceMediaId))
        .orderBy(desc(media.voteAverage))
        .limit(5);

      for (let rank = 0; rank < recItems.length; rank++) {
        rows.push({
          mediaId: recItems[rank]!.mediaId,
          weight: SERVER_BASE_WEIGHT * rankMultiplier(rank + 1),
        });
      }
    }
  }

  // 5. Rebuild with granular weights (dedup keeps highest weight per mediaId)
  await rebuildUserRecommendations(db, userId, rows);

  const genreBreakdown = seedMediaIds.length > 0
    ? ` (seeds from ${new Set(allUserItems.filter((i) => seedMediaIds.includes(i.mediaId)).map((i) => i.genres?.[0] ?? "Other")).size} genres)`
    : "";

  console.log(
    `[rebuild-user-recs] User ${userId}: ${seedMediaIds.length} seeds${genreBreakdown}, ${rows.length} weighted recs, ${serverSourceCount} server sources`,
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
    .select({ mediaId: mediaRecommendation.mediaId })
    .from(mediaRecommendation)
    .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
    .where(eq(mediaRecommendation.sourceMediaId, mediaId))
    .orderBy(desc(media.voteAverage))
    .limit(MAX_POOL_RANK);

  if (recItems.length === 0) return;

  // New item gets top sourceWeight (position 0)
  const rows = recItems.map((p, rank) => ({
    mediaId: p.mediaId,
    weight: 1.0 * rankMultiplier(rank + 1),
  }));

  await upsertUserRecommendations(db, userId, rows);

  console.log(
    `[add-media-to-user-recs] User ${userId}: added ${rows.length} recs from media ${mediaId}`,
  );
}
