import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import {
  episode,
  episodeTranslation,
  media,
  mediaCredit,
  mediaTranslation,
  season,
  seasonTranslation,
} from "@canto/db/schema";
import type { Aspect, GapReport } from "./media/ensure-media.types";
import { EXTRAS_TTL_MS, METADATA_TTL_MS } from "./media/ensure-media.types";

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
      metadataUpdatedAt: true,
      extrasUpdatedAt: true,
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
  ]);

  const now = Date.now();
  const metadataStale =
    !mediaRow.metadataUpdatedAt ||
    now - mediaRow.metadataUpdatedAt.getTime() > METADATA_TTL_MS;

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
    !mediaRow.extrasUpdatedAt ||
    now - mediaRow.extrasUpdatedAt.getTime() > EXTRAS_TTL_MS ||
    extrasRows === 0;

  const gaps: Aspect[] = [];
  if (metadataStale) gaps.push("metadata");
  if (structureMissing) gaps.push("structure");
  if (Object.keys(translationsMissingByLang).length > 0) gaps.push("translations");
  if (logosMissingByLang.length > 0) gaps.push("logos");
  if (extrasStale) gaps.push("extras");

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

  const mediaTransRows = await db
    .select({ language: mediaTranslation.language })
    .from(mediaTranslation)
    .where(
      and(
        eq(mediaTranslation.mediaId, mediaId),
        sql`${mediaTranslation.language} IN (${sql.join(
          languages.map((l) => sql`${l}`),
          sql`, `,
        )})`,
        isNotNull(mediaTranslation.title),
      ),
    );
  for (const row of mediaTransRows) {
    const bucket = result[row.language];
    if (bucket) bucket.media = 1;
  }

  if (!isShow) return result;

  const seasonTransRows = await db
    .select({
      language: seasonTranslation.language,
      n: sql<number>`count(*)::int`,
    })
    .from(seasonTranslation)
    .innerJoin(season, eq(seasonTranslation.seasonId, season.id))
    .where(
      and(
        eq(season.mediaId, mediaId),
        sql`${seasonTranslation.language} IN (${sql.join(
          languages.map((l) => sql`${l}`),
          sql`, `,
        )})`,
      ),
    )
    .groupBy(seasonTranslation.language);
  for (const row of seasonTransRows) {
    const bucket = result[row.language];
    if (bucket) bucket.season = row.n;
  }

  const episodeTransRows = await db
    .select({
      language: episodeTranslation.language,
      n: sql<number>`count(*)::int`,
    })
    .from(episodeTranslation)
    .innerJoin(episode, eq(episodeTranslation.episodeId, episode.id))
    .innerJoin(season, eq(episode.seasonId, season.id))
    .where(
      and(
        eq(season.mediaId, mediaId),
        sql`${episodeTranslation.language} IN (${sql.join(
          languages.map((l) => sql`${l}`),
          sql`, `,
        )})`,
      ),
    )
    .groupBy(episodeTranslation.language);
  for (const row of episodeTransRows) {
    const bucket = result[row.language];
    if (bucket) bucket.episode = row.n;
  }

  return result;
}

async function listLogoLangs(db: Database, mediaId: string): Promise<string[]> {
  const rows = await db
    .select({ language: mediaTranslation.language })
    .from(mediaTranslation)
    .where(
      and(
        eq(mediaTranslation.mediaId, mediaId),
        isNotNull(mediaTranslation.logoPath),
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
