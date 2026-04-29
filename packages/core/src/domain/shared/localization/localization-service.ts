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
        overview: sql`COALESCE(EXCLUDED.overview, ${mediaLocalization.overview})`,
        tagline: sql`COALESCE(EXCLUDED.tagline, ${mediaLocalization.tagline})`,
        posterPath: sql`COALESCE(EXCLUDED.poster_path, ${mediaLocalization.posterPath})`,
        logoPath: sql`COALESCE(EXCLUDED.logo_path, ${mediaLocalization.logoPath})`,
        trailerKey: sql`COALESCE(EXCLUDED.trailer_key, ${mediaLocalization.trailerKey})`,
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
        name: sql`COALESCE(EXCLUDED.name, ${seasonLocalization.name})`,
        overview: sql`COALESCE(EXCLUDED.overview, ${seasonLocalization.overview})`,
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
        title: sql`COALESCE(EXCLUDED.title, ${episodeLocalization.title})`,
        overview: sql`COALESCE(EXCLUDED.overview, ${episodeLocalization.overview})`,
        source,
        updatedAt: now,
      },
    });
}

// ─── Overlay helpers (drop-in replacements for legacy translation-service) ───

export interface OverlayableMedia {
  id: string;
  title: string;
  overview?: string | null;
  tagline?: string | null;
  posterPath?: string | null;
  logoPath?: string | null;
}

export interface OverlayableEpisode {
  id: string;
  title: string | null;
  overview: string | null;
}

export interface OverlayableSeason {
  id: string;
  name: string | null;
  overview: string | null;
}

/**
 * Overlay localized fields onto a media row, reading from `media_localization`
 * with en-US fallback. Preserves every other column on the row. Drop-in
 * replacement for the legacy `applyMediaTranslation` helper but routed through
 * the unified localization read path.
 */
export async function applyMediaLocalizationOverlay<T extends OverlayableMedia>(
  db: Database,
  row: T,
  language: string,
): Promise<T> {
  const loc = await findMediaLocalized(db, row.id, language);
  if (!loc) return row;
  return {
    ...row,
    title: loc.title,
    overview: loc.overview,
    tagline: loc.tagline,
    posterPath: loc.posterPath,
    logoPath: loc.logoPath,
  };
}

export interface OverlayableMediaItem {
  id?: string | null;
  title: string;
  overview?: string | null;
  posterPath?: string | null;
  logoPath?: string | null;
}

/**
 * Overlay localized fields onto a flat list of media items, reading from
 * `media_localization` with en-US fallback in a single batch query. Items
 * lacking an `id` (e.g., live TMDB stubs that haven't been persisted yet)
 * pass through unchanged. Drop-in replacement for the legacy
 * `translateMediaItems` helper for already-persisted items.
 */
export async function applyMediaItemsLocalizationOverlay<
  T extends OverlayableMediaItem,
>(db: Database, items: T[], language: string): Promise<T[]> {
  if (items.length === 0) return items;
  const ids = items
    .map((i) => i.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return items;
  const localized = await findMediaLocalizedMany(db, ids, language);
  if (localized.length === 0) return items;
  const locById = new Map(localized.map((l) => [l.id, l]));
  return items.map((item) => {
    if (!item.id) return item;
    const loc = locById.get(item.id);
    if (!loc) return item;
    return {
      ...item,
      title: loc.title,
      overview: loc.overview,
      posterPath: loc.posterPath,
      logoPath: loc.logoPath,
    };
  });
}

/**
 * Overlay localized name/overview onto seasons + localized title/overview
 * onto each season's episodes. Drop-in replacement for the legacy
 * `applySeasonsTranslation` helper.
 *
 * Issues 1 query for season localizations + 1 query per season for episode
 * localizations (parallel via `Promise.all`). Matches the migration pattern
 * documented in Phase 1C-β.
 */
export async function applySeasonsLocalizationOverlay<
  E extends OverlayableEpisode,
  S extends OverlayableSeason & { episodes: E[] },
>(
  db: Database,
  mediaId: string,
  seasons: S[],
  language: string,
): Promise<S[]> {
  if (seasons.length === 0) return seasons;

  const [localizedSeasons, episodeLocsPerSeason] = await Promise.all([
    resolveLocalizedSeasons(db, mediaId, language),
    Promise.all(
      seasons.map((s) => resolveLocalizedEpisodes(db, s.id, language)),
    ),
  ]);

  const seasonLocById = new Map(localizedSeasons.map((s) => [s.id, s]));

  return seasons.map((s, idx) => {
    const seasonLoc = seasonLocById.get(s.id);
    const epLocs = episodeLocsPerSeason[idx] ?? [];
    const epLocById = new Map(epLocs.map((e) => [e.id, e]));

    const newEpisodes = s.episodes.map((e) => {
      const epLoc = epLocById.get(e.id);
      if (!epLoc) return e;
      return { ...e, title: epLoc.title, overview: epLoc.overview };
    });

    if (!seasonLoc) {
      return { ...s, episodes: newEpisodes };
    }
    return {
      ...s,
      name: seasonLoc.name,
      overview: seasonLoc.overview,
      episodes: newEpisodes,
    };
  });
}
