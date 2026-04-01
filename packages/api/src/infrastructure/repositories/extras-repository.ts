import { and, desc, eq, lte, not, isNull, isNotNull, notInArray, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  blocklist,
  mediaCredit,
  mediaVideo,
  mediaWatchProvider,
  recommendationPool,
  watchProviderLink,
} from "@canto/db/schema";

// ── Credits ──

export async function findCreditsByMediaId(db: Database, mediaId: string) {
  return db.query.mediaCredit.findMany({
    where: eq(mediaCredit.mediaId, mediaId),
    orderBy: (c, { asc }) => [asc(c.order)],
  });
}

// ── Videos ──

export async function findVideosByMediaId(db: Database, mediaId: string) {
  return db.query.mediaVideo.findMany({
    where: eq(mediaVideo.mediaId, mediaId),
  });
}

// ── Watch Providers ──

export async function findWatchProvidersByMediaId(db: Database, mediaId: string) {
  return db.query.mediaWatchProvider.findMany({
    where: eq(mediaWatchProvider.mediaId, mediaId),
  });
}

// ── Recommendation Pool ──

export async function findPoolBySource(
  db: Database,
  sourceMediaId: string,
  sourceType: string,
) {
  return db.query.recommendationPool.findMany({
    where: and(
      eq(recommendationPool.sourceMediaId, sourceMediaId),
      eq(recommendationPool.sourceType, sourceType),
    ),
  });
}

export async function findPoolItemsWithBackdrops(db: Database, limit: number) {
  const today = new Date().toISOString().slice(0, 10);
  return db.query.recommendationPool.findMany({
    where: and(
      not(isNull(recommendationPool.backdropPath)),
      lte(recommendationPool.releaseDate, today),
    ),
    orderBy: [desc(recommendationPool.releaseDate)],
    limit,
  });
}

export async function findPoolRecommendations(
  db: Database,
  excludeItems: Array<{ externalId: number; provider: string }>,
  limit: number,
  offset: number,
) {
  const today = new Date().toISOString().slice(0, 10);
  const released = lte(recommendationPool.releaseDate, today);

  // Build exclusion: items already in library (match by provider+externalId)
  const excludeConditions =
    excludeItems.length > 0
      ? excludeItems.map(
          (item) =>
            and(
              eq(recommendationPool.externalId, item.externalId),
              eq(recommendationPool.provider, item.provider),
            )!,
        )
      : [];

  const where =
    excludeConditions.length > 0
      ? and(released, not(sql`(${sql.join(excludeConditions, sql` OR `)})`))
      : released;

  return db.query.recommendationPool.findMany({
    where,
    orderBy: [desc(recommendationPool.score)],
    limit,
    offset,
  });
}

// ── Blocklist ──

export async function findBlocklistByMediaId(db: Database, mediaId: string) {
  return db.query.blocklist.findMany({
    where: eq(blocklist.mediaId, mediaId),
    columns: { title: true },
  });
}

export async function findBlocklistEntry(
  db: Database,
  mediaId: string,
  title: string,
) {
  return db.query.blocklist.findFirst({
    where: and(eq(blocklist.mediaId, mediaId), eq(blocklist.title, title)),
  });
}

export async function createBlocklistEntry(
  db: Database,
  data: typeof blocklist.$inferInsert,
) {
  const [row] = await db.insert(blocklist).values(data).returning();
  return row;
}

// ── Watch Provider Links ──

export async function findWatchProviderLinks(db: Database) {
  return db
    .select({
      providerId: watchProviderLink.providerId,
      searchUrlTemplate: watchProviderLink.searchUrlTemplate,
    })
    .from(watchProviderLink)
    .where(isNotNull(watchProviderLink.searchUrlTemplate));
}
