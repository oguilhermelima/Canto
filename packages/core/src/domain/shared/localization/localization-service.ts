import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "@canto/db/client";
import {
  episode,
  episodeLocalization,
  mediaLocalization,
  season,
  seasonLocalization,
} from "@canto/db/schema";
import {
  findMediaLocalized,
  findMediaLocalizedByExternal,
  findMediaLocalizedMany,
} from "../../../infra/media/media-localized-repository";
import type {
  EpisodeLocalizationPayload,
  LocalizationSource,
  LocalizedEpisode,
  LocalizedMedia,
  LocalizedSeason,
  MediaLocalizationPayload,
  SeasonLocalizationPayload,
} from "./types";

const EN = "en-US";

export async function resolveLocalizedMedia(
  db: Database,
  mediaId: string,
  language: string,
): Promise<LocalizedMedia | null> {
  return findMediaLocalized(db, mediaId, language);
}

export async function resolveLocalizedMediaByExternal(
  db: Database,
  externalId: number,
  provider: string,
  type: string,
  language: string,
): Promise<LocalizedMedia | null> {
  return findMediaLocalizedByExternal(db, externalId, provider, type, language);
}

export async function resolveLocalizedMediaMany(
  db: Database,
  mediaIds: string[],
  language: string,
): Promise<LocalizedMedia[]> {
  return findMediaLocalizedMany(db, mediaIds, language);
}

export async function resolveLocalizedSeasons(
  db: Database,
  mediaId: string,
  language: string,
): Promise<LocalizedSeason[]> {
  const isEn = language === EN;
  const locEn = alias(seasonLocalization, "loc_en");

  if (isEn) {
    return db
      .select({
        id: season.id,
        mediaId: season.mediaId,
        number: season.number,
        posterPath: season.posterPath,
        airDate: season.airDate,
        episodeCount: season.episodeCount,
        voteAverage: season.voteAverage,
        name: sql<string | null>`${locEn.name}`,
        overview: sql<string | null>`${locEn.overview}`,
      })
      .from(season)
      .leftJoin(
        locEn,
        and(eq(locEn.seasonId, season.id), eq(locEn.language, EN)),
      )
      .where(eq(season.mediaId, mediaId))
      .orderBy(season.number);
  }

  const locUser = alias(seasonLocalization, "loc_user");
  return db
    .select({
      id: season.id,
      mediaId: season.mediaId,
      number: season.number,
      posterPath: season.posterPath,
      airDate: season.airDate,
      episodeCount: season.episodeCount,
      voteAverage: season.voteAverage,
      name: sql<string | null>`COALESCE(${locUser.name}, ${locEn.name})`,
      overview: sql<string | null>`COALESCE(${locUser.overview}, ${locEn.overview})`,
    })
    .from(season)
    .leftJoin(
      locUser,
      and(eq(locUser.seasonId, season.id), eq(locUser.language, language)),
    )
    .leftJoin(
      locEn,
      and(eq(locEn.seasonId, season.id), eq(locEn.language, EN)),
    )
    .where(eq(season.mediaId, mediaId))
    .orderBy(season.number);
}

export async function resolveLocalizedEpisodes(
  db: Database,
  seasonId: string,
  language: string,
): Promise<LocalizedEpisode[]> {
  const isEn = language === EN;
  const locEn = alias(episodeLocalization, "loc_en");

  if (isEn) {
    return db
      .select({
        id: episode.id,
        seasonId: episode.seasonId,
        number: episode.number,
        externalId: episode.externalId,
        airDate: episode.airDate,
        runtime: episode.runtime,
        stillPath: episode.stillPath,
        voteAverage: episode.voteAverage,
        voteCount: episode.voteCount,
        title: sql<string | null>`${locEn.title}`,
        overview: sql<string | null>`${locEn.overview}`,
      })
      .from(episode)
      .leftJoin(
        locEn,
        and(eq(locEn.episodeId, episode.id), eq(locEn.language, EN)),
      )
      .where(eq(episode.seasonId, seasonId))
      .orderBy(episode.number);
  }

  const locUser = alias(episodeLocalization, "loc_user");
  return db
    .select({
      id: episode.id,
      seasonId: episode.seasonId,
      number: episode.number,
      externalId: episode.externalId,
      airDate: episode.airDate,
      runtime: episode.runtime,
      stillPath: episode.stillPath,
      voteAverage: episode.voteAverage,
      voteCount: episode.voteCount,
      title: sql<string | null>`COALESCE(${locUser.title}, ${locEn.title})`,
      overview: sql<string | null>`COALESCE(${locUser.overview}, ${locEn.overview})`,
    })
    .from(episode)
    .leftJoin(
      locUser,
      and(eq(locUser.episodeId, episode.id), eq(locUser.language, language)),
    )
    .leftJoin(
      locEn,
      and(eq(locEn.episodeId, episode.id), eq(locEn.language, EN)),
    )
    .where(eq(episode.seasonId, seasonId))
    .orderBy(episode.number);
}

export async function upsertMediaLocalization(
  db: Database,
  mediaId: string,
  language: string,
  payload: MediaLocalizationPayload,
  source: LocalizationSource,
): Promise<void> {
  const now = new Date();
  await db
    .insert(mediaLocalization)
    .values({
      mediaId,
      language,
      title: payload.title,
      overview: payload.overview ?? null,
      tagline: payload.tagline ?? null,
      posterPath: payload.posterPath ?? null,
      logoPath: payload.logoPath ?? null,
      trailerKey: payload.trailerKey ?? null,
      source,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [mediaLocalization.mediaId, mediaLocalization.language],
      set: {
        title: payload.title,
        overview: payload.overview ?? null,
        tagline: payload.tagline ?? null,
        posterPath: payload.posterPath ?? null,
        logoPath: payload.logoPath ?? null,
        trailerKey: payload.trailerKey ?? null,
        source,
        updatedAt: now,
      },
    });
}

export async function upsertSeasonLocalization(
  db: Database,
  seasonId: string,
  language: string,
  payload: SeasonLocalizationPayload,
  source: LocalizationSource,
): Promise<void> {
  const now = new Date();
  await db
    .insert(seasonLocalization)
    .values({
      seasonId,
      language,
      name: payload.name ?? null,
      overview: payload.overview ?? null,
      source,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [seasonLocalization.seasonId, seasonLocalization.language],
      set: {
        name: payload.name ?? null,
        overview: payload.overview ?? null,
        source,
        updatedAt: now,
      },
    });
}

export async function upsertEpisodeLocalization(
  db: Database,
  episodeId: string,
  language: string,
  payload: EpisodeLocalizationPayload,
  source: LocalizationSource,
): Promise<void> {
  const now = new Date();
  await db
    .insert(episodeLocalization)
    .values({
      episodeId,
      language,
      title: payload.title ?? null,
      overview: payload.overview ?? null,
      source,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [episodeLocalization.episodeId, episodeLocalization.language],
      set: {
        title: payload.title ?? null,
        overview: payload.overview ?? null,
        source,
        updatedAt: now,
      },
    });
}
