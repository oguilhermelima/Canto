import { and, asc, desc, eq, isNull, isNotNull, not, sql } from "drizzle-orm";
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
import type { RecsFilters } from "./user-recommendation-repository";

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
      isNotNull(media.backdropPath),
      sql`${media.releaseDate} <= CURRENT_DATE OR ${media.releaseDate} IS NULL`,
    ),
    orderBy: [desc(media.releaseDate)],
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
  const {
    genreIds,
    genreMode = "or",
    language,
    scoreMin,
    yearMin,
    yearMax,
    runtimeMin,
    runtimeMax,
    certification,
    status,
    sortBy,
  } = filters;

  const released = sql`${media.releaseDate} <= CURRENT_DATE OR ${media.releaseDate} IS NULL`;

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

  const genreCondition =
    genreIds && genreIds.length > 0
      ? genreMode === "and"
        ? sql`${media.genreIds}::jsonb @> ${JSON.stringify(genreIds)}::jsonb`
        : sql`(${sql.join(genreIds.map((id) => sql`${media.genreIds}::jsonb @> ${JSON.stringify([id])}::jsonb`), sql` OR `)})`
      : undefined;

  const languageCondition = language ? eq(media.originalLanguage, language) : undefined;
  const scoreCondition = scoreMin != null ? sql`${media.voteAverage} >= ${scoreMin}` : undefined;
  const yearMinCondition = yearMin ? sql`${media.releaseDate} >= ${yearMin + "-01-01"}` : undefined;
  const yearMaxCondition = yearMax ? sql`${media.releaseDate} <= ${yearMax + "-12-31"}` : undefined;
  const runtimeMinCondition = runtimeMin != null ? sql`${media.runtime} >= ${runtimeMin}` : undefined;
  const runtimeMaxCondition = runtimeMax != null ? sql`${media.runtime} <= ${runtimeMax}` : undefined;
  const certCondition = certification ? eq(media.contentRating, certification) : undefined;
  const statusCondition = status ? eq(media.status, status) : undefined;

  const where = and(
    sql`${media.id} IN (SELECT media_id FROM media_recommendation)`,
    released,
    ...(excludeConditions.length > 0
      ? [not(sql`(${sql.join(excludeConditions, sql` OR `)})`)]
      : []),
    ...(genreCondition ? [genreCondition] : []),
    ...(languageCondition ? [languageCondition] : []),
    ...(scoreCondition ? [scoreCondition] : []),
    ...(yearMinCondition ? [yearMinCondition] : []),
    ...(yearMaxCondition ? [yearMaxCondition] : []),
    ...(runtimeMinCondition ? [runtimeMinCondition] : []),
    ...(runtimeMaxCondition ? [runtimeMaxCondition] : []),
    ...(certCondition ? [certCondition] : []),
    ...(statusCondition ? [statusCondition] : []),
  );

  // Map sortBy to orderBy
  let orderBy;
  switch (sortBy) {
    case "vote_average.desc":
      orderBy = [desc(media.voteAverage)];
      break;
    case "vote_average.asc":
      orderBy = [asc(media.voteAverage)];
      break;
    case "primary_release_date.desc":
      orderBy = [desc(media.releaseDate)];
      break;
    case "primary_release_date.asc":
      orderBy = [asc(media.releaseDate)];
      break;
    case "title.asc":
      orderBy = [asc(media.title)];
      break;
    case "title.desc":
      orderBy = [desc(media.title)];
      break;
    default:
      orderBy = [desc(media.voteAverage)];
      break;
  }

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
