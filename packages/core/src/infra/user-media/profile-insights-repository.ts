import { and, asc, count, desc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { media, userMediaState } from "@canto/db/schema";
import { mediaI18n } from "@canto/core/infra/shared/media-i18n";

export async function findUserRatingDistribution(
  db: Database,
  userId: string,
): Promise<Array<{ rating: number; count: number }>> {
  const rows = await db
    .select({
      rating: userMediaState.rating,
      count: count(),
    })
    .from(userMediaState)
    .where(and(eq(userMediaState.userId, userId), gt(userMediaState.rating, 0)))
    .groupBy(userMediaState.rating)
    .orderBy(asc(userMediaState.rating));

  return rows.map((r) => ({ rating: r.rating!, count: r.count }));
}

export async function findUserTopGenres(
  db: Database,
  userId: string,
  limit = 10,
): Promise<Array<{ genre: string; count: number }>> {
  return db
    .select({
      genre: sql<string>`jsonb_array_elements_text(${media.genres})`,
      count: count(),
    })
    .from(userMediaState)
    .innerJoin(media, eq(userMediaState.mediaId, media.id))
    .where(
      and(
        eq(userMediaState.userId, userId),
        sql`${userMediaState.status} != 'none'`,
      ),
    )
    .groupBy(sql`jsonb_array_elements_text(${media.genres})`)
    .orderBy(desc(count()))
    .limit(limit);
}

export interface UserRecentActivityRow {
  mediaId: string;
  title: string;
  posterPath: string | null;
  mediaType: string;
  status: string | null;
  rating: number | null;
  isFavorite: boolean;
  updatedAt: Date;
}

export async function findUserRecentActivity(
  db: Database,
  userId: string,
  language: string,
  limit = 8,
): Promise<UserRecentActivityRow[]> {
  const mi = mediaI18n(language);
  return db
    .select({
      mediaId: userMediaState.mediaId,
      title: mi.title,
      posterPath: mi.posterPath,
      mediaType: media.type,
      status: userMediaState.status,
      rating: userMediaState.rating,
      isFavorite: userMediaState.isFavorite,
      updatedAt: userMediaState.updatedAt,
    })
    .from(userMediaState)
    .innerJoin(media, eq(userMediaState.mediaId, media.id))
    .leftJoin(mi.locUser, mi.locUserJoin)
    .leftJoin(mi.locEn, mi.locEnJoin)
    .where(
      and(
        eq(userMediaState.userId, userId),
        sql`${userMediaState.status} != 'none'`,
      ),
    )
    .orderBy(desc(userMediaState.updatedAt))
    .limit(limit);
}

export interface ProfileInsights {
  decadeDistribution: Array<{ decade: string; count: number }>;
  hiddenGem: { title: string; posterPath: string | null; backdropPath: string | null; userRating: number; publicRating: number } | null;
  unpopularOpinion: { title: string; posterPath: string | null; backdropPath: string | null; userRating: number; publicRating: number } | null;
  shortestMovie: { title: string; runtime: number } | null;
  longestMovie: { title: string; runtime: number } | null;
  averageRuntime: number;
  countries: Array<{ country: string; count: number }>;
  languages: Array<{ language: string; count: number }>;
  recentPercent: number;
  oldestTitle: { title: string; year: number } | null;
  perfectScores: number;
  lowestRatedCount: number;
}

export async function findUserProfileInsights(
  db: Database,
  userId: string,
  language: string,
): Promise<ProfileInsights> {
  const active = and(
    eq(userMediaState.userId, userId),
    sql`${userMediaState.status} != 'none'`,
  );
  const completed = and(
    eq(userMediaState.userId, userId),
    eq(userMediaState.status, "completed"),
  );
  const rated = and(
    eq(userMediaState.userId, userId),
    gt(userMediaState.rating, 0),
  );
  const fiveYearsAgo = new Date().getFullYear() - 5;

  const [
    decadeRows,
    hiddenGemRows,
    unpopularRows,
    shortestRows,
    longestRows,
    [avgRow],
    countryRows,
    languageRows,
    [recentRow],
    [totalActiveRow],
    oldestRows,
    [perfectRow],
    [lowestRow],
  ] = await Promise.all([
    // Decade distribution
    db.select({
      decade: sql<string>`(floor(${media.year}::int / 10) * 10)::text`,
      count: count(),
    })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(active, sql`${media.year} is not null`))
      .groupBy(sql`floor(${media.year}::int / 10) * 10`)
      .orderBy(desc(count())),

    // Hidden gem: user rated much higher than public
    (() => {
      const mi = mediaI18n(language);
      return db.select({
        title: mi.title,
        posterPath: mi.posterPath,
        backdropPath: media.backdropPath,
        userRating: userMediaState.rating,
        publicRating: media.voteAverage,
      })
        .from(userMediaState)
        .innerJoin(media, eq(userMediaState.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .where(and(rated, sql`${media.voteAverage} > 0`))
        .orderBy(sql`${userMediaState.rating} - ${media.voteAverage} desc`)
        .limit(1);
    })(),

    // Unpopular opinion: user rated much lower than public
    (() => {
      const mi = mediaI18n(language);
      return db.select({
        title: mi.title,
        posterPath: mi.posterPath,
        backdropPath: media.backdropPath,
        userRating: userMediaState.rating,
        publicRating: media.voteAverage,
      })
        .from(userMediaState)
        .innerJoin(media, eq(userMediaState.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .where(and(rated, sql`${media.voteAverage} > 0`))
        .orderBy(sql`${userMediaState.rating} - ${media.voteAverage} asc`)
        .limit(1);
    })(),

    // Shortest completed movie
    (() => {
      const mi = mediaI18n(language);
      return db.select({ title: mi.title, runtime: media.runtime })
        .from(userMediaState)
        .innerJoin(media, eq(userMediaState.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .where(and(completed, eq(media.type, "movie"), sql`${media.runtime} > 0`))
        .orderBy(asc(media.runtime))
        .limit(1);
    })(),

    // Longest completed movie
    (() => {
      const mi = mediaI18n(language);
      return db.select({ title: mi.title, runtime: media.runtime })
        .from(userMediaState)
        .innerJoin(media, eq(userMediaState.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .where(and(completed, eq(media.type, "movie"), sql`${media.runtime} > 0`))
        .orderBy(desc(media.runtime))
        .limit(1);
    })(),

    // Average runtime
    db.select({ avg: sql<number>`coalesce(avg(${media.runtime}), 0)` })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(completed, eq(media.type, "movie"), sql`${media.runtime} > 0`)),

    // Country distribution
    db.select({
      country: sql<string>`jsonb_array_elements_text(${media.originCountry})`,
      count: count(),
    })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(active, sql`${media.originCountry} is not null`))
      .groupBy(sql`jsonb_array_elements_text(${media.originCountry})`)
      .orderBy(desc(count()))
      .limit(10),

    // Language distribution
    db.select({
      language: media.originalLanguage,
      count: count(),
    })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(active, sql`${media.originalLanguage} is not null`))
      .groupBy(media.originalLanguage)
      .orderBy(desc(count()))
      .limit(10),

    // Recent (last 5 years) count
    db.select({ count: count() })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(and(active, sql`${media.year} >= ${fiveYearsAgo}`)),

    // Total active count
    db.select({ count: count() })
      .from(userMediaState)
      .innerJoin(media, eq(userMediaState.mediaId, media.id))
      .where(active),

    // Oldest title
    (() => {
      const mi = mediaI18n(language);
      return db.select({ title: mi.title, year: media.year })
        .from(userMediaState)
        .innerJoin(media, eq(userMediaState.mediaId, media.id))
        .leftJoin(mi.locUser, mi.locUserJoin)
        .leftJoin(mi.locEn, mi.locEnJoin)
        .where(and(active, sql`${media.year} is not null`))
        .orderBy(asc(media.year))
        .limit(1);
    })(),

    // Perfect scores (10/10)
    db.select({ count: count() })
      .from(userMediaState)
      .where(and(eq(userMediaState.userId, userId), eq(userMediaState.rating, 10))),

    // Lowest ratings (1-3)
    db.select({ count: count() })
      .from(userMediaState)
      .where(and(eq(userMediaState.userId, userId), gt(userMediaState.rating, 0), sql`${userMediaState.rating} <= 3`)),
  ]);

  const totalActive = totalActiveRow?.count ?? 0;
  const recentCount = recentRow?.count ?? 0;

  return {
    decadeDistribution: decadeRows.map((r) => ({ decade: r.decade, count: r.count })),
    hiddenGem: hiddenGemRows[0] ? {
      title: hiddenGemRows[0].title,
      posterPath: hiddenGemRows[0].posterPath,
      backdropPath: hiddenGemRows[0].backdropPath,
      userRating: hiddenGemRows[0].userRating!,
      publicRating: Number(hiddenGemRows[0].publicRating),
    } : null,
    unpopularOpinion: unpopularRows[0] ? {
      title: unpopularRows[0].title,
      posterPath: unpopularRows[0].posterPath,
      backdropPath: unpopularRows[0].backdropPath,
      userRating: unpopularRows[0].userRating!,
      publicRating: Number(unpopularRows[0].publicRating),
    } : null,
    shortestMovie: shortestRows[0]?.runtime ? { title: shortestRows[0].title, runtime: shortestRows[0].runtime } : null,
    longestMovie: longestRows[0]?.runtime ? { title: longestRows[0].title, runtime: longestRows[0].runtime } : null,
    averageRuntime: Number(avgRow?.avg ?? 0),
    countries: countryRows.map((r) => ({ country: r.country, count: r.count })),
    languages: languageRows.filter((r) => r.language !== null).map((r) => ({ language: r.language!, count: r.count })),
    recentPercent: totalActive > 0 ? Math.round((recentCount / totalActive) * 100) : 0,
    oldestTitle: oldestRows[0]?.year ? { title: oldestRows[0].title, year: oldestRows[0].year } : null,
    perfectScores: perfectRow?.count ?? 0,
    lowestRatedCount: lowestRow?.count ?? 0,
  };
}
