import { and, eq, inArray, or, sql  } from "drizzle-orm";
import type {SQL} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "@canto/db/client";
import { media, mediaLocalization } from "@canto/db/schema";
import type { LocalizedMedia } from "../../domain/shared/localization/types";

const EN = "en-US";

type LocAlias = ReturnType<typeof alias<typeof mediaLocalization, string>>;

function buildSelect(locUser: LocAlias | null, locEn: LocAlias) {
  return {
    id: media.id,
    type: media.type,
    externalId: media.externalId,
    provider: media.provider,
    originalTitle: media.originalTitle,
    originalLanguage: media.originalLanguage,
    backdropPath: media.backdropPath,
    releaseDate: media.releaseDate,
    year: media.year,
    lastAirDate: media.lastAirDate,
    status: media.status,
    genres: media.genres,
    contentRating: media.contentRating,
    voteAverage: media.voteAverage,
    voteCount: media.voteCount,
    popularity: media.popularity,
    runtime: media.runtime,
    imdbId: media.imdbId,
    tvdbId: media.tvdbId,
    numberOfSeasons: media.numberOfSeasons,
    numberOfEpisodes: media.numberOfEpisodes,
    inProduction: media.inProduction,
    title: locUser
      ? sql<string>`COALESCE(${locUser.title}, ${locEn.title})`
      : sql<string>`${locEn.title}`,
    overview: locUser
      ? sql<string | null>`COALESCE(${locUser.overview}, ${locEn.overview})`
      : sql<string | null>`${locEn.overview}`,
    tagline: locUser
      ? sql<string | null>`COALESCE(${locUser.tagline}, ${locEn.tagline})`
      : sql<string | null>`${locEn.tagline}`,
    posterPath: locUser
      ? sql<string | null>`COALESCE(${locUser.posterPath}, ${locEn.posterPath})`
      : sql<string | null>`${locEn.posterPath}`,
    logoPath: locUser
      ? sql<string | null>`COALESCE(${locUser.logoPath}, ${locEn.logoPath})`
      : sql<string | null>`${locEn.logoPath}`,
    trailerKey: locUser
      ? sql<string | null>`COALESCE(${locUser.trailerKey}, ${locEn.trailerKey})`
      : sql<string | null>`${locEn.trailerKey}`,
  };
}

async function runQuery(
  db: Database,
  language: string,
  where: SQL,
  limit?: number,
): Promise<LocalizedMedia[]> {
  const isEn = language === EN;
  const locEn = alias(mediaLocalization, "loc_en");

  if (isEn) {
    const q = db
      .select(buildSelect(null, locEn))
      .from(media)
      .leftJoin(
        locEn,
        and(eq(locEn.mediaId, media.id), eq(locEn.language, EN)),
      )
      .where(where);
    return limit !== undefined ? q.limit(limit) : q;
  }

  const locUser = alias(mediaLocalization, "loc_user");
  const q = db
    .select(buildSelect(locUser, locEn))
    .from(media)
    .leftJoin(
      locUser,
      and(eq(locUser.mediaId, media.id), eq(locUser.language, language)),
    )
    .leftJoin(
      locEn,
      and(eq(locEn.mediaId, media.id), eq(locEn.language, EN)),
    )
    .where(where);
  return limit !== undefined ? q.limit(limit) : q;
}

export async function findMediaLocalized(
  db: Database,
  mediaId: string,
  language: string,
): Promise<LocalizedMedia | null> {
  const [row] = await runQuery(db, language, eq(media.id, mediaId), 1);
  return row ?? null;
}

export async function findMediaLocalizedByExternal(
  db: Database,
  externalId: number,
  provider: string,
  type: string,
  language: string,
): Promise<LocalizedMedia | null> {
  const where = and(
    eq(media.externalId, externalId),
    eq(media.provider, provider),
    eq(media.type, type),
  );
  if (!where) return null;
  const [row] = await runQuery(db, language, where, 1);
  return row ?? null;
}

export async function findMediaLocalizedMany(
  db: Database,
  mediaIds: string[],
  language: string,
): Promise<LocalizedMedia[]> {
  if (mediaIds.length === 0) return [];
  return runQuery(db, language, inArray(media.id, mediaIds));
}

/**
 * Batch sibling of `findMediaLocalizedByExternal`. Resolves a list of
 * `(externalId, provider, type)` triples in a single query, returning the
 * usual user-lang + en-US COALESCE'd rows.
 *
 * Used by callers that don't carry an internal media UUID but do know the
 * external identifier — e.g. the spotlight TMDB-trending fallback, which
 * builds items straight off `tmdb.getMetadata` without first looking the
 * row up in our DB. Without this helper, those items would silently miss
 * localization (overlay helpers key on `media.id`).
 */
export async function findMediaLocalizedByExternalMany(
  db: Database,
  refs: Array<{ externalId: number; provider: string; type: string }>,
  language: string,
): Promise<LocalizedMedia[]> {
  if (refs.length === 0) return [];
  const conditions = refs
    .map((r) =>
      and(
        eq(media.externalId, r.externalId),
        eq(media.provider, r.provider),
        eq(media.type, r.type),
      ),
    )
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
  if (conditions.length === 0) return [];
  const where = or(...conditions);
  if (where === undefined) return [];
  return runQuery(db, language, where);
}
