import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  not,
  sql,
} from "drizzle-orm";

import type { Database } from "@canto/db/client";
import {
  media,
  mediaAspectState,
  mediaCredit,
  mediaRecommendation,
  mediaVideo,
  mediaWatchProvider,
  tmdbCertification,
  watchProviderLink,
} from "@canto/db/schema";

import type {
  LocalizedRecommendationItem,
  MediaExtrasRepositoryPort,
  RecommendationSourceItem,
} from "@canto/core/domain/media/ports/media-extras-repository.port";
import { mediaI18n } from "@canto/core/infra/shared/media-i18n";
import { buildRecsFilterConditions, recsSortOrder } from "@canto/core/infra/recommendations/recs-filter-builder";
import {
  getQualityFilters,
  getWeightedScoreOrder,
} from "@canto/core/domain/recommendations/rules/recommendation-filters";
import {
  toDomain as creditToDomain,
  toRow as creditToRow,
} from "@canto/core/infra/content-enrichment/media-credit.mapper";
import {
  toDomain as videoToDomain,
  toRow as videoToRow,
} from "@canto/core/infra/content-enrichment/media-video.mapper";
import {
  toDomain as watchProviderToDomain,
  toRow as watchProviderToRow,
} from "@canto/core/infra/content-enrichment/media-watch-provider.mapper";
import { recommendationToRow } from "@canto/core/infra/content-enrichment/media-extras-meta.mapper";

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

export function makeMediaExtrasRepository(
  db: Database,
): MediaExtrasRepositoryPort {
  return {
    // ─── Credits ───
    findCreditsByMediaId: async (mediaId) => {
      const rows = await db.query.mediaCredit.findMany({
        where: eq(mediaCredit.mediaId, mediaId),
        orderBy: (c, { asc }) => [asc(c.order)],
      });
      return rows.map(creditToDomain);
    },
    deleteCreditsByMediaId: async (mediaId) => {
      await db.delete(mediaCredit).where(eq(mediaCredit.mediaId, mediaId));
    },
    insertCredits: async (rows) => {
      if (rows.length === 0) return;
      await db.insert(mediaCredit).values(rows.map(creditToRow));
    },

    // ─── Videos ───
    findVideosByMediaId: async (mediaId) => {
      const rows = await db.query.mediaVideo.findMany({
        where: eq(mediaVideo.mediaId, mediaId),
      });
      return rows.map(videoToDomain);
    },
    deleteVideosByMediaId: async (mediaId) => {
      await db.delete(mediaVideo).where(eq(mediaVideo.mediaId, mediaId));
    },
    insertVideos: async (rows) => {
      if (rows.length === 0) return;
      await db.insert(mediaVideo).values(rows.map(videoToRow));
    },
    findTrailerKeysForMediaIds: async (mediaIds) => {
      if (mediaIds.length === 0) return new Map();
      const rows = await db
        .select({
          mediaId: mediaVideo.mediaId,
          externalKey: mediaVideo.externalKey,
        })
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
    },

    // ─── Watch providers ───
    findWatchProvidersByMediaId: async (mediaId) => {
      const rows = await db.query.mediaWatchProvider.findMany({
        where: eq(mediaWatchProvider.mediaId, mediaId),
      });
      return rows.map(watchProviderToDomain);
    },
    deleteWatchProvidersByMediaId: async (mediaId) => {
      await db
        .delete(mediaWatchProvider)
        .where(eq(mediaWatchProvider.mediaId, mediaId));
    },
    insertWatchProviders: async (rows) => {
      if (rows.length === 0) return;
      await db.insert(mediaWatchProvider).values(rows.map(watchProviderToRow));
    },
    findWatchProviderLinks: async () => {
      return db
        .select({
          providerId: watchProviderLink.providerId,
          searchUrlTemplate: watchProviderLink.searchUrlTemplate,
        })
        .from(watchProviderLink)
        .where(isNotNull(watchProviderLink.searchUrlTemplate));
    },

    // ─── Recommendations ───
    findRecommendationsBySource: async (sourceMediaId, sourceType, language) => {
      const mi = mediaI18n(language);
      const rows: RecommendationSourceItem[] = await db
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
        .where(
          and(
            eq(mediaRecommendation.sourceMediaId, sourceMediaId),
            eq(mediaRecommendation.sourceType, sourceType),
          ),
        );
      return rows;
    },

    findRecommendedMediaWithBackdrops: async (language, limit) => {
      const mi = mediaI18n(language);
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
      return rows as unknown as LocalizedRecommendationItem[];
    },

    findGlobalRecommendations: async (
      excludeItems,
      limit,
      offset,
      language,
      filters = {},
    ) => {
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

      if (rows.length === 0) {
        return rows as unknown as LocalizedRecommendationItem[];
      }

      // Trailer keys come from the same media_video table — joined inline so
      // callers don't double-query through the legacy helper.
      const trailerKeyRows = await db
        .select({
          mediaId: mediaVideo.mediaId,
          externalKey: mediaVideo.externalKey,
        })
        .from(mediaVideo)
        .where(
          and(
            inArray(
              mediaVideo.mediaId,
              rows.map((r) => r.id),
            ),
            eq(mediaVideo.type, "Trailer"),
            eq(mediaVideo.site, "YouTube"),
          ),
        );
      const trailerByMediaId = new Map<string, string>();
      for (const row of trailerKeyRows) {
        if (!trailerByMediaId.has(row.mediaId))
          trailerByMediaId.set(row.mediaId, row.externalKey);
      }
      return rows.map((row) => ({
        ...(row as unknown as LocalizedRecommendationItem),
        trailerKey: trailerByMediaId.get(row.id) ?? null,
      }));
    },

    findRecommendationsForSource: async (sourceMediaId) => {
      const rows = await db
        .select({
          id: mediaRecommendation.id,
          mediaId: mediaRecommendation.mediaId,
          sourceType: mediaRecommendation.sourceType,
        })
        .from(mediaRecommendation)
        .where(eq(mediaRecommendation.sourceMediaId, sourceMediaId));
      return rows;
    },

    deleteRecommendationsByIds: async (ids) => {
      if (ids.length === 0) return;
      await db
        .delete(mediaRecommendation)
        .where(inArray(mediaRecommendation.id, ids));
    },

    deleteRecommendationsBySource: async (sourceMediaId) => {
      await db
        .delete(mediaRecommendation)
        .where(eq(mediaRecommendation.sourceMediaId, sourceMediaId));
    },

    insertRecommendation: async (row) => {
      await db
        .insert(mediaRecommendation)
        .values(recommendationToRow(row))
        .onConflictDoNothing();
    },

    // ─── TMDB certifications ───
    upsertTmdbCertifications: async (rows) => {
      if (rows.length === 0) return 0;
      for (let i = 0; i < rows.length; i += 500) {
        await db
          .insert(tmdbCertification)
          .values(
            rows.slice(i, i + 500).map((c) => ({
              type: c.type,
              region: c.region,
              rating: c.rating,
              meaning: c.meaning ?? null,
              sortOrder: c.sortOrder,
            })),
          )
          .onConflictDoUpdate({
            target: [
              tmdbCertification.type,
              tmdbCertification.region,
              tmdbCertification.rating,
            ],
            set: {
              meaning: sql`EXCLUDED.meaning`,
              sortOrder: sql`EXCLUDED.sort_order`,
              updatedAt: sql`NOW()`,
            },
          });
      }
      return rows.length;
    },

    countTmdbCertifications: async (type) => {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tmdbCertification)
        .where(eq(tmdbCertification.type, type));
      return rows[0]?.count ?? 0;
    },
  };
}

// `desc` is intentionally not used yet — kept imported for parity with the
// legacy file when the global recs ordering switches to a desc-by-released
// fallback (planned for Wave Final).
void desc;
