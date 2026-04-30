import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  episode,
  episodeLocalization,
  media,
  mediaContentRating,
  mediaCredit,
  mediaLocalization,
  season,
  seasonLocalization,
} from "@canto/db/schema";
import { findAspectSucceededAt } from "../../../infra/media/media-aspect-state-repository";

const EN = "en-US";
import type { Aspect, GapReport } from "./ensure-media.types";
import { EXTRAS_TTL_MS, METADATA_TTL_MS } from "./ensure-media.types";

/**
 * Inspect DB state and compute what's missing for the given languages.
 * Pure read — no writes, no provider calls.
 *
 * Returns:
 * - `gaps`: aspects that have at least one hole for the requested langs.
 * - `details`: per-aspect breakdown so callers can display meaningful info.
 */
export async function detectGaps(
  db: Database,
  mediaId: string,
  languages: string[],
): Promise<GapReport> {
  const mediaRow = await db.query.media.findFirst({
    where: eq(media.id, mediaId),
    columns: {
      id: true,
      type: true,
    },
  });

  if (!mediaRow) {
    return {
      mediaId,
      languages,
      gaps: [],
      details: {
        metadataStale: false,
        structureMissing: false,
        translationsMissingByLang: {},
        logosMissingByLang: [],
        extrasStale: false,
        contentRatingsMissing: false,
      },
    };
  }

  const nonEnLangs = languages.filter((l) => !l.startsWith("en"));
  const isShow = mediaRow.type === "show";

  const [
    seasonCount,
    episodeCount,
    translationCounts,
    logoLangs,
    extrasRows,
    contentRatingCount,
    metadataSucceededAt,
    extrasSucceededAt,
  ] = await Promise.all([
    isShow ? countSeasons(db, mediaId) : Promise.resolve(0),
    isShow ? countEpisodes(db, mediaId) : Promise.resolve(0),
    nonEnLangs.length > 0
      ? countTranslationsPerLang(db, mediaId, nonEnLangs, isShow)
      : Promise.resolve<TranslationCounts>({}),
    nonEnLangs.length > 0
      ? listLogoLangs(db, mediaId)
      : Promise.resolve<string[]>([]),
    countExtrasQuick(db, mediaId),
    countContentRatings(db, mediaId),
    findAspectSucceededAt(db, mediaId, "metadata"),
    findAspectSucceededAt(db, mediaId, "extras"),
  ]);

  const now = Date.now();
  const metadataStale =
    !metadataSucceededAt ||
    now - metadataSucceededAt.getTime() > METADATA_TTL_MS;

  const structureMissing = isShow && seasonCount === 0;

  const translationsMissingByLang: GapReport["details"]["translationsMissingByLang"] = {};
  for (const lang of nonEnLangs) {
    const counts = translationCounts[lang] ?? {
      media: 0,
      season: 0,
      episode: 0,
    };
    const mediaMissing = counts.media === 0;
    const seasonGaps = Math.max(0, seasonCount - counts.season);
    const episodeGaps = Math.max(0, episodeCount - counts.episode);
    if (mediaMissing || seasonGaps > 0 || episodeGaps > 0) {
      translationsMissingByLang[lang] = {
        media: mediaMissing,
        seasons: seasonGaps,
        episodes: episodeGaps,
      };
    }
  }

  const logoLangSet = new Set(logoLangs);
  const logosMissingByLang = nonEnLangs.filter((l) => !logoLangSet.has(l));

  const extrasStale =
    !extrasSucceededAt ||
    now - extrasSucceededAt.getTime() > EXTRAS_TTL_MS ||
    extrasRows === 0;

  const contentRatingsMissing = contentRatingCount === 0;

  const gaps: Aspect[] = [];
  if (metadataStale) gaps.push("metadata");
  if (structureMissing) gaps.push("structure");
  if (Object.keys(translationsMissingByLang).length > 0) gaps.push("translations");
  if (logosMissingByLang.length > 0) gaps.push("logos");
  if (extrasStale) gaps.push("extras");
  if (contentRatingsMissing) gaps.push("contentRatings");

  return {
    mediaId,
    languages,
    gaps,
    details: {
      metadataStale,
      structureMissing,
      translationsMissingByLang,
      logosMissingByLang,
      extrasStale,
      contentRatingsMissing,
    },
  };
}

interface TranslationCounts {
  [lang: string]: { media: number; season: number; episode: number };
}

async function countSeasons(db: Database, mediaId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(season)
    .where(eq(season.mediaId, mediaId));
  return row?.n ?? 0;
}

async function countEpisodes(db: Database, mediaId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(episode)
    .innerJoin(season, eq(episode.seasonId, season.id))
    .where(eq(season.mediaId, mediaId));
  return row?.n ?? 0;
}

async function countTranslationsPerLang(
  db: Database,
  mediaId: string,
  languages: string[],
  isShow: boolean,
): Promise<TranslationCounts> {
  const result: TranslationCounts = {};
  for (const lang of languages) {
    result[lang] = { media: 0, season: 0, episode: 0 };
  }

  // Counts from `media_localization` (and the new season/episode localization
  // tables). The en-US row is the canonical baseline — never counted as a
  // translation here. The `languages` filter already excludes en-US (callers
  // pass `nonEnLangs`), but we add an explicit guard to keep the count semantics
  // safe regardless of caller intent.
  const mediaLocRows = await db
    .select({ language: mediaLocalization.language })
    .from(mediaLocalization)
    .where(
      and(
        eq(mediaLocalization.mediaId, mediaId),
        sql`${mediaLocalization.language} IN (${sql.join(
          languages.map((l) => sql`${l}`),
          sql`, `,
        )})`,
        ne(mediaLocalization.language, EN),
      ),
    );
  for (const row of mediaLocRows) {
    const bucket = result[row.language];
    if (bucket) bucket.media = 1;
  }

  if (!isShow) return result;

  const seasonLocRows = await db
    .select({
      language: seasonLocalization.language,
      n: sql<number>`count(*)::int`,
    })
    .from(seasonLocalization)
    .innerJoin(season, eq(seasonLocalization.seasonId, season.id))
    .where(
      and(
        eq(season.mediaId, mediaId),
        sql`${seasonLocalization.language} IN (${sql.join(
          languages.map((l) => sql`${l}`),
          sql`, `,
        )})`,
        ne(seasonLocalization.language, EN),
      ),
    )
    .groupBy(seasonLocalization.language);
  for (const row of seasonLocRows) {
    const bucket = result[row.language];
    if (bucket) bucket.season = row.n;
  }

  const episodeLocRows = await db
    .select({
      language: episodeLocalization.language,
      n: sql<number>`count(*)::int`,
    })
    .from(episodeLocalization)
    .innerJoin(episode, eq(episodeLocalization.episodeId, episode.id))
    .innerJoin(season, eq(episode.seasonId, season.id))
    .where(
      and(
        eq(season.mediaId, mediaId),
        sql`${episodeLocalization.language} IN (${sql.join(
          languages.map((l) => sql`${l}`),
          sql`, `,
        )})`,
        ne(episodeLocalization.language, EN),
      ),
    )
    .groupBy(episodeLocalization.language);
  for (const row of episodeLocRows) {
    const bucket = result[row.language];
    if (bucket) bucket.episode = row.n;
  }

  return result;
}

async function listLogoLangs(db: Database, mediaId: string): Promise<string[]> {
  const rows = await db
    .select({ language: mediaLocalization.language })
    .from(mediaLocalization)
    .where(
      and(
        eq(mediaLocalization.mediaId, mediaId),
        isNotNull(mediaLocalization.logoPath),
        ne(mediaLocalization.language, EN),
      ),
    );
  return rows.map((r) => r.language);
}

async function countExtrasQuick(db: Database, mediaId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mediaCredit)
    .where(eq(mediaCredit.mediaId, mediaId));
  return row?.n ?? 0;
}

async function countContentRatings(db: Database, mediaId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mediaContentRating)
    .where(eq(mediaContentRating.mediaId, mediaId));
  return row?.n ?? 0;
}
