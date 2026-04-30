import { and, desc, eq, inArray, isNotNull, not, sql } from "drizzle-orm";
import { getQualityFilters, getWeightedScoreOrder } from "../../domain/recommendations/rules/recommendation-filters";
import type { Database } from "@canto/db/client";
import {
  blocklist,
  media,
  mediaAspectState,
  mediaCredit,
  mediaRecommendation,
  mediaVideo,
  mediaWatchProvider,
  watchProviderLink,
} from "@canto/db/schema";

/**
 * SQL fragment that filters to media whose `metadata` aspect has been
 * successfully fetched at least once. Replaces the legacy
 * `media.metadata_updated_at IS NOT NULL` filter — stub rows (created from
 * recommendation/similar payloads with no full metadata fetch) lack a
 * `media_aspect_state` row for `aspect='metadata'`, so this excludes them.
 */
const metadataFetchedExists = sql`EXISTS (
  SELECT 1 FROM ${mediaAspectState}
  WHERE ${mediaAspectState.mediaId} = ${media.id}
    AND ${mediaAspectState.aspect} = 'metadata'
    AND ${mediaAspectState.scope} = ''
    AND ${mediaAspectState.succeededAt} IS NOT NULL
)`;
import type { RecsFilters } from "../../domain/recommendations/types/recs-filters";
import { buildRecsFilterConditions, recsSortOrder } from "../recommendations/recs-filter-builder";

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
      metadataFetchedExists,
      isNotNull(media.backdropPath),
      sql`(${media.releaseDate} <= CURRENT_DATE OR ${media.releaseDate} IS NULL)`,
      ...getQualityFilters(),
    ),
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
    metadataFetchedExists,
    released,
    ...getQualityFilters(),
    ...(excludeConditions.length > 0
      ? [not(sql`(${sql.join(excludeConditions, sql` OR `)})`)]
      : []),
    ...buildRecsFilterConditions(filters),
  );

  const customSort = recsSortOrder(filters.sortBy);
  const orderBy = customSort ? [customSort] : [getWeightedScoreOrder()];

  const rows = await db.query.media.findMany({
    where,
    orderBy,
    limit,
    offset,
  });

  if (rows.length === 0) return rows;

  const trailerByMediaId = await findTrailerKeysForMediaIds(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => ({
    ...row,
    trailerKey: trailerByMediaId.get(row.id) ?? null,
  }));
}

/** Batch-lookup YouTube trailer keys for a set of media ids. */
export async function findTrailerKeysForMediaIds(
  db: Database,
  mediaIds: string[],
): Promise<Map<string, string>> {
  if (mediaIds.length === 0) return new Map();
  const rows = await db
    .select({ mediaId: mediaVideo.mediaId, externalKey: mediaVideo.externalKey })
    .from(mediaVideo)
    .where(
      and(
        inArray(mediaVideo.mediaId, mediaIds),
        eq(mediaVideo.type, "Trailer"),
        eq(mediaVideo.site, "YouTube"),
      ),
    );
  const out = new Map<string, string>();
  for (const row of rows) {
    if (!out.has(row.mediaId)) out.set(row.mediaId, row.externalKey);
  }
  return out;
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
