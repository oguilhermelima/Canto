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
  findMediaLocalizedByExternalMany,
  findMediaLocalizedMany,
} from "@canto/core/infra/media/media-localized-repository";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type {
  EpisodeLocalizationPayload,
  LocalizationSource,
  LocalizedEpisode,
  LocalizedMedia,
  LocalizedSeason,
  MediaLocalizationPayload,
  SeasonLocalizationPayload,
} from "@canto/core/domain/shared/localization/types";

const EN = "en-US";

/**
 * Deps bag every overlay helper accepts. Wave 9C2 routed the overlay reads
 * through the localization port — callers either build it once at the entry
 * edge via `makeMediaLocalizationRepository(db)` or thread it down through
 * a higher-level deps interface (`PersistDeps.localization` etc).
 */
export interface LocalizationOverlayDeps {
  localization: MediaLocalizationRepositoryPort;
}

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

/**
 * Batch resolve localized rows by `(externalId, provider, type)`. Used when
 * callers carry the external identifier instead of the internal media UUID
 * (e.g. spotlight TMDB-trending fallback items built directly off provider
 * responses).
 */
export async function resolveLocalizedMediaByExternalMany(
  db: Database,
  refs: Array<{ externalId: number; provider: string; type: string }>,
  language: string,
): Promise<LocalizedMedia[]> {
  return findMediaLocalizedByExternalMany(db, refs, language);
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
  // Title/overview/tagline/posterPath/logoPath now live exclusively on
  // `media_localization` — overlay reads them from there. Inputs may carry
  // stale copies (legacy callers) but the overlay always sources from the
  // localized row.
  title?: string | null;
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
 *
 * After Phase 1C-δ the base `media` row no longer carries title/overview/
 * tagline/posterPath/logoPath — the overlay is the canonical reader for those
 * fields. When no localization row exists (theoretically only possible for
 * unpersisted media), the original row is returned unchanged.
 */
export async function applyMediaLocalizationOverlay<T extends OverlayableMedia>(
  row: T,
  language: string,
  deps: LocalizationOverlayDeps,
): Promise<T & {
  title: string;
  overview: string | null;
  tagline: string | null;
  posterPath: string | null;
  logoPath: string | null;
}> {
  const loc = await deps.localization.findLocalizedById(row.id, language);
  const overlay = loc
    ? {
        title: loc.title,
        overview: loc.overview,
        tagline: loc.tagline,
        posterPath: loc.posterPath,
        logoPath: loc.logoPath,
      }
    : {
        title: row.title ?? "",
        overview: row.overview ?? null,
        tagline: row.tagline ?? null,
        posterPath: row.posterPath ?? null,
        logoPath: row.logoPath ?? null,
      };
  return { ...row, ...overlay };
}

export interface OverlayableMediaItem {
  id?: string | null;
  /**
   * External identifier triple — used as a fallback lookup key when `id` is
   * missing. The spotlight TMDB-trending fallback (and any other path that
   * builds items straight off provider responses without first persisting
   * them) carries these instead of the internal UUID.
   */
  externalId?: number | null;
  provider?: string | null;
  type?: string | null;
  title?: string | null;
  overview?: string | null;
  posterPath?: string | null;
  logoPath?: string | null;
}

/**
 * Overlay localized fields onto a flat list of media items, reading from
 * `media_localization` with en-US fallback in a single batch query. Items
 * are looked up by `id` when present; items lacking `id` but carrying
 * `(externalId, provider, type)` are looked up via the external-key index.
 * Items with neither pass through unchanged (TMDB-only items not in our
 * DB). Drop-in replacement for the legacy `translateMediaItems` helper.
 */
export async function applyMediaItemsLocalizationOverlay<
  T extends OverlayableMediaItem,
>(items: T[], language: string, deps: LocalizationOverlayDeps): Promise<T[]> {
  if (items.length === 0) return items;

  const ids = items
    .map((i) => i.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const externalRefs = items
    .filter(
      (i) =>
        (typeof i.id !== "string" || i.id.length === 0) &&
        typeof i.externalId === "number" &&
        typeof i.provider === "string" &&
        typeof i.type === "string",
    )
    .map((i) => ({
      externalId: i.externalId as number,
      provider: i.provider as string,
      type: i.type as string,
    }));

  const [byId, byExternal] = await Promise.all([
    ids.length > 0
      ? deps.localization.findLocalizedManyByIds(ids, language)
      : Promise.resolve([] as LocalizedMedia[]),
    externalRefs.length > 0
      ? deps.localization.findLocalizedManyByExternal(externalRefs, language)
      : Promise.resolve([] as LocalizedMedia[]),
  ]);

  const locById = new Map(byId.map((l) => [l.id, l]));
  // External key follows the same `${provider}-${type}-${externalId}` shape
  // used elsewhere (fetch-logos, spotlight-source) so the lookup composes
  // cleanly with existing call sites.
  const locByExternalKey = new Map(
    byExternal.map((l) => [
      `${l.provider}-${l.type}-${l.externalId}`,
      l,
    ]),
  );

  return items.map((item) => {
    let loc: LocalizedMedia | undefined;
    if (item.id) {
      loc = locById.get(item.id);
    } else if (
      typeof item.externalId === "number" &&
      typeof item.provider === "string" &&
      typeof item.type === "string"
    ) {
      loc = locByExternalKey.get(
        `${item.provider}-${item.type}-${item.externalId}`,
      );
    }
    if (!loc) {
      return {
        ...item,
        title: item.title ?? "",
        overview: item.overview ?? null,
        posterPath: item.posterPath ?? null,
        logoPath: item.logoPath ?? null,
      } as T;
    }
    return {
      ...item,
      title: loc.title,
      overview: loc.overview,
      posterPath: loc.posterPath,
      logoPath: loc.logoPath,
    } as T;
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
  mediaId: string,
  seasons: S[],
  language: string,
  deps: LocalizationOverlayDeps,
): Promise<S[]> {
  if (seasons.length === 0) return seasons;

  const [localizedSeasons, episodeLocsPerSeason] = await Promise.all([
    deps.localization.findLocalizedSeasonsByMedia(mediaId, language),
    Promise.all(
      seasons.map((s) =>
        deps.localization.findLocalizedEpisodesBySeason(s.id, language),
      ),
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
