import { and, desc, eq, isNotNull, not, sql } from "drizzle-orm";
import { getQualityFilters, getWeightedScoreOrder } from "../../../domain/rules/recommendation-filters";
import type { Database } from "@canto/db/client";
import {
  blocklist,
  media,
  mediaCredit,
  mediaRecommendation,
  mediaVideo,
  mediaWatchProvider,
  watchProviderLink,
} from "@canto/db/schema";
import type { RecsFilters } from "../../../domain/types/recs-filters";
import { buildRecsFilterConditions, recsSortOrder } from "../shared/recs-filter-builder";

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

// ── Recommendations (via media_recommendation junction) ──

export async function findRecommendationsBySource(
  db: Database,
  sourceMediaId: string,
  sourceType: string,
) {
  return db
    .select({
      id: media.id,
      externalId: media.externalId,
      provider: media.provider,
      mediaType: media.type,
      title: media.title,
      overview: media.overview,
      posterPath: media.posterPath,
      backdropPath: media.backdropPath,
      logoPath: media.logoPath,
      releaseDate: media.releaseDate,
      voteAverage: media.voteAverage,
    })
    .from(mediaRecommendation)
    .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
    .where(and(
      eq(mediaRecommendation.sourceMediaId, sourceMediaId),
      eq(mediaRecommendation.sourceType, sourceType),
    ));
}

export async function findRecommendedMediaWithBackdrops(db: Database, limit: number) {
  return db.query.media.findMany({
    where: and(
      sql`${media.id} IN (SELECT media_id FROM media_recommendation)`,
      isNotNull(media.metadataUpdatedAt),
      isNotNull(media.backdropPath),
      // Parens on the OR are load-bearing: drizzle's `and(...)` wraps each
      // arg but passes `sql` templates through verbatim. Without them SQL
      // precedence turns `X AND (A OR B) AND Y` into `X AND A OR B AND Y`,
      // which makes `release_date IS NULL` a catch-all that explodes the
      // result set into a full-table scan.
      sql`(${media.releaseDate} <= CURRENT_DATE OR ${media.releaseDate} IS NULL)`,
      ...getQualityFilters(),
    ),
    // Rank by Bayesian weighted score so the spotlight surfaces well-known
    // titles instead of freshly-released obscure items with zero votes.
    orderBy: [getWeightedScoreOrder()],
    limit,
  });
}

export async function findGlobalRecommendations(
  db: Database,
  excludeItems: Array<{ externalId: number; provider: string }>,
  limit: number,
  offset: number,
  filters: RecsFilters = {},
) {
  const released = sql`(${media.releaseDate} <= CURRENT_DATE OR ${media.releaseDate} IS NULL)`;

  const excludeConditions =
    excludeItems.length > 0
      ? excludeItems.map(
          (item) =>
            and(
              eq(media.externalId, item.externalId),
              eq(media.provider, item.provider),
            )!,
        )
      : [];

  const where = and(
    sql`${media.id} IN (SELECT media_id FROM media_recommendation)`,
    isNotNull(media.metadataUpdatedAt),
    released,
    ...getQualityFilters(),
    ...(excludeConditions.length > 0
      ? [not(sql`(${sql.join(excludeConditions, sql` OR `)})`)]
      : []),
    ...buildRecsFilterConditions(filters),
  );

  const customSort = recsSortOrder(filters.sortBy);
  const orderBy = customSort ? [customSort] : [getWeightedScoreOrder()];

  return db.query.media.findMany({
    where,
    orderBy,
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
