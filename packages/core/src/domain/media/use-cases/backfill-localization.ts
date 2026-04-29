import { and, asc, eq, gt, isNotNull, sql } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import {
  episode,
  episodeLocalization,
  episodeTranslation,
  media,
  mediaLocalization,
  mediaTranslation,
  season,
  seasonLocalization,
  seasonTranslation,
} from "@canto/db/schema";

const BASE_LANGUAGE = "en-US";

const CHUNK_SIZE = 500;

export interface BackfillLocalizationResult {
  mediasSeededFromBase: number;
  mediaTranslationsCopied: number;
  seasonTranslationsCopied: number;
  episodeTranslationsCopied: number;
}

function providerToSource(provider: string | null): string {
  return provider === "tvdb" ? "tvdb" : "tmdb";
}

async function seedFromBaseMedia(db: Database): Promise<number> {
  let inserted = 0;
  let cursor: string | null = null;

  while (true) {
    const conditions = [isNotNull(media.title)];
    if (cursor !== null) conditions.push(gt(media.id, cursor));

    const rows = await db
      .select({
        id: media.id,
        title: media.title,
        overview: media.overview,
        tagline: media.tagline,
        posterPath: media.posterPath,
        logoPath: media.logoPath,
      })
      .from(media)
      .where(and(...conditions))
      .orderBy(asc(media.id))
      .limit(CHUNK_SIZE);

    if (rows.length === 0) break;

    const values = rows.map((r) => ({
      mediaId: r.id,
      language: BASE_LANGUAGE,
      title: r.title,
      overview: r.overview,
      tagline: r.tagline,
      posterPath: r.posterPath,
      logoPath: r.logoPath,
      trailerKey: null,
      source: "original",
    }));

    const result = await db
      .insert(mediaLocalization)
      .values(values)
      .onConflictDoNothing()
      .returning({ mediaId: mediaLocalization.mediaId });
    inserted += result.length;

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < CHUNK_SIZE) break;
  }

  return inserted;
}

async function copyMediaTranslations(db: Database): Promise<number> {
  let inserted = 0;
  let cursor: string | null = null;

  while (true) {
    const rows = await db
      .select({
        id: mediaTranslation.id,
        mediaId: mediaTranslation.mediaId,
        language: mediaTranslation.language,
        title: mediaTranslation.title,
        overview: mediaTranslation.overview,
        tagline: mediaTranslation.tagline,
        posterPath: mediaTranslation.posterPath,
        logoPath: mediaTranslation.logoPath,
        trailerKey: mediaTranslation.trailerKey,
        provider: media.provider,
      })
      .from(mediaTranslation)
      .innerJoin(media, eq(mediaTranslation.mediaId, media.id))
      .where(
        and(
          isNotNull(mediaTranslation.title),
          cursor === null ? sql`TRUE` : gt(mediaTranslation.id, cursor),
        ),
      )
      .orderBy(asc(mediaTranslation.id))
      .limit(CHUNK_SIZE);

    if (rows.length === 0) break;

    const values = rows.map((r) => ({
      mediaId: r.mediaId,
      language: r.language,
      title: r.title!,
      overview: r.overview,
      tagline: r.tagline,
      posterPath: r.posterPath,
      logoPath: r.logoPath,
      trailerKey: r.trailerKey,
      source: providerToSource(r.provider),
    }));

    const result = await db
      .insert(mediaLocalization)
      .values(values)
      .onConflictDoNothing()
      .returning({ mediaId: mediaLocalization.mediaId });
    inserted += result.length;

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < CHUNK_SIZE) break;
  }

  return inserted;
}

async function copySeasonTranslations(db: Database): Promise<number> {
  let inserted = 0;
  let cursor: string | null = null;

  while (true) {
    const rows = await db
      .select({
        id: seasonTranslation.id,
        seasonId: seasonTranslation.seasonId,
        language: seasonTranslation.language,
        name: seasonTranslation.name,
        overview: seasonTranslation.overview,
        provider: media.provider,
      })
      .from(seasonTranslation)
      .innerJoin(season, eq(seasonTranslation.seasonId, season.id))
      .innerJoin(media, eq(season.mediaId, media.id))
      .where(cursor === null ? sql`TRUE` : gt(seasonTranslation.id, cursor))
      .orderBy(asc(seasonTranslation.id))
      .limit(CHUNK_SIZE);

    if (rows.length === 0) break;

    const values = rows.map((r) => ({
      seasonId: r.seasonId,
      language: r.language,
      name: r.name,
      overview: r.overview,
      source: providerToSource(r.provider),
    }));

    const result = await db
      .insert(seasonLocalization)
      .values(values)
      .onConflictDoNothing()
      .returning({ seasonId: seasonLocalization.seasonId });
    inserted += result.length;

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < CHUNK_SIZE) break;
  }

  return inserted;
}

async function copyEpisodeTranslations(db: Database): Promise<number> {
  let inserted = 0;
  let cursor: string | null = null;

  while (true) {
    const rows = await db
      .select({
        id: episodeTranslation.id,
        episodeId: episodeTranslation.episodeId,
        language: episodeTranslation.language,
        title: episodeTranslation.title,
        overview: episodeTranslation.overview,
        provider: media.provider,
      })
      .from(episodeTranslation)
      .innerJoin(episode, eq(episodeTranslation.episodeId, episode.id))
      .innerJoin(season, eq(episode.seasonId, season.id))
      .innerJoin(media, eq(season.mediaId, media.id))
      .where(cursor === null ? sql`TRUE` : gt(episodeTranslation.id, cursor))
      .orderBy(asc(episodeTranslation.id))
      .limit(CHUNK_SIZE);

    if (rows.length === 0) break;

    const values = rows.map((r) => ({
      episodeId: r.episodeId,
      language: r.language,
      title: r.title,
      overview: r.overview,
      source: providerToSource(r.provider),
    }));

    const result = await db
      .insert(episodeLocalization)
      .values(values)
      .onConflictDoNothing()
      .returning({ episodeId: episodeLocalization.episodeId });
    inserted += result.length;

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < CHUNK_SIZE) break;
  }

  return inserted;
}

export async function backfillLocalization(
  db: Database,
): Promise<BackfillLocalizationResult> {
  const mediasSeededFromBase = await seedFromBaseMedia(db);
  const mediaTranslationsCopied = await copyMediaTranslations(db);
  const seasonTranslationsCopied = await copySeasonTranslations(db);
  const episodeTranslationsCopied = await copyEpisodeTranslations(db);

  return {
    mediasSeededFromBase,
    mediaTranslationsCopied,
    seasonTranslationsCopied,
    episodeTranslationsCopied,
  };
}
