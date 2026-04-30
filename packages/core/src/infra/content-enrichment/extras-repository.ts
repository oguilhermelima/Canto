import { and, desc, eq, getTableColumns, inArray, isNotNull, not, sql } from "drizzle-orm";
import { getQualityFilters, getWeightedScoreOrder } from "@canto/core/infra/recommendations/recommendation-filters";
import type { Database } from "@canto/db/client";
import {
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
import { mediaI18n } from "../shared/media-i18n";

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
  language: string,
) {
  const mi = mediaI18n(language);
  return db
    .select({
      id: media.id,
      externalId: media.externalId,
      provider: media.provider,
      mediaType: media.type,
      title: mi.title,
      overview: mi.overview,
      posterPath: mi.posterPath,
      backdropPath: media.backdropPath,
      logoPath: mi.logoPath,
      releaseDate: media.releaseDate,
      voteAverage: media.voteAverage,
    })
    .from(mediaRecommendation)
    .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
    .leftJoin(mi.locUser, mi.locUserJoin)
    .leftJoin(mi.locEn, mi.locEnJoin)
    .where(and(
      eq(mediaRecommendation.sourceMediaId, sourceMediaId),
      eq(mediaRecommendation.sourceType, sourceType),
    ));
}

export async function findRecommendedMediaWithBackdrops(
  db: Database,
  language: string,
  limit: number,
) {
  const mi = mediaI18n(language);
  const mediaCols = getTableColumns(media);

  return db
    .select({
      ...mediaCols,
      title: mi.title,
      overview: mi.overview,
      posterPath: mi.posterPath,
      logoPath: mi.logoPath,
      tagline: mi.tagline,
    })
    .from(media)
    .leftJoin(mi.locUser, mi.locUserJoin)
    .leftJoin(mi.locEn, mi.locEnJoin)
    .where(
      and(
        sql`${media.id} IN (SELECT media_id FROM media_recommendation)`,
        metadataFetchedExists,
        isNotNull(media.backdropPath),
        sql`(${media.releaseDate} <= CURRENT_DATE OR ${media.releaseDate} IS NULL)`,
        ...getQualityFilters(),
      ),
    )
    .orderBy(getWeightedScoreOrder())
    .limit(limit);
}

export async function findGlobalRecommendations(
  db: Database,
  excludeItems: Array<{ externalId: number; provider: string }>,
  limit: number,
  offset: number,
  language: string,
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

  const mi = mediaI18n(language);
  const filterConditions = buildRecsFilterConditions(filters, {
    id: media.id,
    title: mi.title,
    genreIds: media.genreIds,
    originalLanguage: media.originalLanguage,
    voteAverage: media.voteAverage,
    releaseDate: media.releaseDate,
    runtime: media.runtime,
    contentRating: media.contentRating,
    status: media.status,
  });

  const where = and(
    sql`${media.id} IN (SELECT media_id FROM media_recommendation)`,
    metadataFetchedExists,
    released,
    ...getQualityFilters(),
    ...(excludeConditions.length > 0
      ? [not(sql`(${sql.join(excludeConditions, sql` OR `)})`)]
      : []),
    ...filterConditions,
  );

  const customSort = recsSortOrder(filters.sortBy, {
    id: media.id,
    title: mi.title,
    genreIds: media.genreIds,
    originalLanguage: media.originalLanguage,
    voteAverage: media.voteAverage,
    releaseDate: media.releaseDate,
    runtime: media.runtime,
    contentRating: media.contentRating,
    status: media.status,
  });
  const orderBy = customSort ? [customSort] : [getWeightedScoreOrder()];

  const mediaCols = getTableColumns(media);
  const rows = await db
    .select({
      ...mediaCols,
      title: mi.title,
      overview: mi.overview,
      posterPath: mi.posterPath,
      logoPath: mi.logoPath,
      tagline: mi.tagline,
    })
    .from(media)
    .leftJoin(mi.locUser, mi.locUserJoin)
    .leftJoin(mi.locEn, mi.locEnJoin)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

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
