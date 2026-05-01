import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  list,
  listItem,
  media,
  mediaLocalization,
  mediaRecommendation,
} from "@canto/db/schema";
import {
  getQualityFilters,
  getWeightedScoreOrder,
} from "@canto/core/infra/recommendations/recommendation-filters";

const EN = "en-US";

export type RecCandidate = {
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

/**
 * Top-N quality-filtered rec candidates for a single seed, ordered by
 * Bayesian weighted score, with en-US localization columns.
 */
export async function findRecCandidatesForSeed(
  db: Database,
  sourceMediaId: string,
  limit: number,
): Promise<RecCandidate[]> {
  const recLocEn = alias(mediaLocalization, "rec_loc_en");
  const recLocEnJoin = and(
    eq(recLocEn.mediaId, media.id),
    eq(recLocEn.language, EN),
  )!;

  const rows = await db
    .select({
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
    })
    .from(mediaRecommendation)
    .innerJoin(media, eq(media.id, mediaRecommendation.mediaId))
    .leftJoin(recLocEn, recLocEnJoin)
    .where(
      and(
        eq(mediaRecommendation.sourceMediaId, sourceMediaId),
        ...getQualityFilters(),
      ),
    )
    .orderBy(getWeightedScoreOrder())
    .limit(limit);
  return rows;
}

/**
 * Distinct source media ids from the server library that have at least one
 * recommendation. Used as fallback seeds when the user has few personal items.
 */
export async function findServerRecSources(
  db: Database,
  limit: number,
): Promise<Array<{ sourceMediaId: string }>> {
  return db
    .selectDistinct({ sourceMediaId: mediaRecommendation.sourceMediaId })
    .from(mediaRecommendation)
    .innerJoin(media, eq(mediaRecommendation.sourceMediaId, media.id))
    .where(eq(media.inLibrary, true))
    .limit(limit);
}

/**
 * User list items with genres and list type, newest first, excluding server
 * library items. Used by the rec-rebuild to select diverse seeds.
 */
export async function findUserListItemsForRecs(
  db: Database,
  userId: string,
): Promise<Array<{ mediaId: string; genres: string[] | null; listType: string }>> {
  const rows = await db
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
        isNull(listItem.deletedAt),
      ),
    )
    .orderBy(desc(listItem.addedAt));
  return rows;
}
