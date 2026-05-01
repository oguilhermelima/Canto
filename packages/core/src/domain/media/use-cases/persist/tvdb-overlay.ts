import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@canto/db/client";
import {
  episode,
  episodeLocalization,
  media,
  mediaFile,
  season,
  seasonLocalization,
  userPlaybackProgress,
  userRating,
  userWatchHistory,
} from "@canto/db/schema";
import type { NormalizedMedia, NormalizedSeason } from "@canto/providers";

import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import { persistSeasons } from "@canto/core/domain/media/use-cases/persist/core";

interface TvdbOverlayDeps {
  localization: MediaLocalizationRepositoryPort;
}

interface TmdbEpisodeData {
  stillPath?: string;
  voteAverage?: number;
  voteCount?: number;
  episodeType?: string;
  crew?: Array<{ name: string; job: string; department?: string; profilePath?: string }>;
  guestStars?: Array<{ name: string; character?: string; profilePath?: string }>;
}

/**
 * Build a flat map of absoluteNumber → TMDB episode data.
 * TMDB seasons are iterated in order (excluding specials/S0), and each
 * episode gets a running absolute index starting at 1.
 */
export function buildTmdbEpisodeMap(
  tmdbSeasons: NormalizedSeason[],
): Map<number, TmdbEpisodeData> {
  const map = new Map<number, TmdbEpisodeData>();
  let absCounter = 0;
  for (const s of tmdbSeasons
    .filter((s) => s.number > 0)
    .sort((a, b) => a.number - b.number)) {
    for (const ep of (s.episodes ?? []).sort((a, b) => a.number - b.number)) {
      absCounter++;
      map.set(absCounter, {
        stillPath: ep.stillPath,
        voteAverage: ep.voteAverage,
        voteCount: ep.voteCount,
        episodeType: ep.episodeType,
        crew: ep.crew,
        guestStars: ep.guestStars,
      });
    }
  }
  return map;
}

/**
 * Overlay TMDB data onto TVDB episodes by matching absoluteNumber.
 * Updates: stillPath, voteAverage, voteCount, episodeType, crew, guestStars.
 * Titles and descriptions stay from TVDB.
 */
export async function overlayTmdbEpisodeData(
  db: Database,
  mediaId: string,
  tmdbEpMap: Map<number, TmdbEpisodeData>,
): Promise<void> {
  if (tmdbEpMap.size === 0) return;

  const seasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    with: {
      episodes: {
        columns: { id: true, absoluteNumber: true },
      },
    },
  });

  const updates: Array<{ id: string; data: TmdbEpisodeData }> = [];
  for (const s of seasons) {
    for (const ep of s.episodes) {
      if (ep.absoluteNumber == null) continue;
      const tmdb = tmdbEpMap.get(ep.absoluteNumber);
      if (tmdb) updates.push({ id: ep.id, data: tmdb });
    }
  }

  if (updates.length === 0) return;

  // crew/guestStars are JSONB — can't use CASE easily.
  for (const u of updates) {
    await db
      .update(episode)
      .set({
        ...(u.data.stillPath ? { stillPath: u.data.stillPath } : {}),
        ...(u.data.voteAverage != null ? { voteAverage: u.data.voteAverage } : {}),
        ...(u.data.voteCount != null ? { voteCount: u.data.voteCount } : {}),
        ...(u.data.episodeType ? { episodeType: u.data.episodeType } : {}),
        ...(u.data.crew ? { crew: u.data.crew } : {}),
        ...(u.data.guestStars ? { guestStars: u.data.guestStars } : {}),
      })
      .where(eq(episode.id, u.id));
  }
}

/**
 * Overlay TMDB voteAverage onto TVDB seasons.
 * Uses season number matching (TMDB S1 voteAverage → TVDB seasons).
 * For anime with split seasons (TVDB S1-S17 vs TMDB S1-S2), only
 * TMDB S1 and S2 can match by number. Others keep null.
 */
export async function overlayTmdbSeasonData(
  db: Database,
  mediaId: string,
  tmdbSeasons: NormalizedSeason[],
): Promise<void> {
  const tmdbSeasonByNumber = new Map(
    tmdbSeasons.filter((s) => s.number > 0).map((s) => [s.number, s]),
  );
  if (tmdbSeasonByNumber.size === 0) return;

  const dbSeasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    columns: { id: true, number: true },
  });

  for (const s of dbSeasons) {
    const tmdb = tmdbSeasonByNumber.get(s.number);
    if (tmdb?.voteAverage != null) {
      await db
        .update(season)
        .set({ voteAverage: tmdb.voteAverage })
        .where(eq(season.id, s.id));
    }
  }
}

/**
 * Apply TVDB season/episode structure to a media item.
 *
 * Strategy: detach → save translations → delete → insert → re-attach → restore.
 *
 * Tables with episodeId/seasonId FK (onDelete: cascade) are detached BEFORE
 * the season delete so rows survive. After new seasons are inserted, FKs are
 * re-attached using absoluteNumber (preferred) or seasonNumber+episodeNumber.
 *
 * Translations (episode_translation, season_translation) don't have a nullable
 * FK — they're saved in memory and re-inserted after the rebuild via the
 * localization port.
 */
export async function applyTvdbSeasons(
  db: Database,
  mediaId: string,
  tvdbSeasons: NormalizedSeason[],
  normalized: NormalizedMedia,
  deps: TvdbOverlayDeps,
): Promise<void> {
  const localization = deps.localization;

  const existingSeasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    with: {
      episodes: {
        columns: { id: true, number: true, absoluteNumber: true },
      },
    },
  });

  const epIdentity = new Map<string, { absoluteNumber: number | null; seasonNumber: number; episodeNumber: number }>();
  for (const s of existingSeasons) {
    for (const e of s.episodes) {
      epIdentity.set(e.id, {
        absoluteNumber: e.absoluteNumber,
        seasonNumber: s.number,
        episodeNumber: e.number,
      });
    }
  }
  const existingEpIds = [...epIdentity.keys()];
  const existingSeasonIds = existingSeasons.map((s) => s.id);

  interface SavedEpTranslation {
    absoluteNumber: number | null;
    seasonNumber: number;
    episodeNumber: number;
    language: string;
    title: string | null;
    overview: string | null;
  }
  let savedEpTranslations: SavedEpTranslation[] = [];

  if (existingEpIds.length > 0) {
    const epLocs = await db
      .select({
        episodeId: episodeLocalization.episodeId,
        language: episodeLocalization.language,
        title: episodeLocalization.title,
        overview: episodeLocalization.overview,
      })
      .from(episodeLocalization)
      .where(
        sql`${episodeLocalization.episodeId} IN (${sql.join(
          existingEpIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    savedEpTranslations = epLocs.map((t) => {
      const info = epIdentity.get(t.episodeId);
      return {
        absoluteNumber: info?.absoluteNumber ?? null,
        seasonNumber: info?.seasonNumber ?? 0,
        episodeNumber: info?.episodeNumber ?? 0,
        language: t.language,
        title: t.title,
        overview: t.overview,
      };
    });
  }

  interface SavedSeasonTranslation {
    seasonNumber: number;
    language: string;
    name: string | null;
    overview: string | null;
  }
  let savedSeasonTranslations: SavedSeasonTranslation[] = [];

  if (existingSeasonIds.length > 0) {
    const sLocs = await db
      .select({
        seasonId: seasonLocalization.seasonId,
        language: seasonLocalization.language,
        name: seasonLocalization.name,
        overview: seasonLocalization.overview,
      })
      .from(seasonLocalization)
      .where(
        sql`${seasonLocalization.seasonId} IN (${sql.join(
          existingSeasonIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    const seasonNumberById = new Map(existingSeasons.map((s) => [s.id, s.number]));
    savedSeasonTranslations = sLocs.map((t) => ({
      seasonNumber: seasonNumberById.get(t.seasonId) ?? 0,
      language: t.language,
      name: t.name,
      overview: t.overview,
    }));
  }

  interface DetachedRow { rowId: string; oldEpisodeId: string }
  const detachedFiles: DetachedRow[] = [];
  const detachedPlayback: DetachedRow[] = [];
  const detachedHistory: DetachedRow[] = [];
  const detachedRatings: Array<DetachedRow & { oldSeasonId: string | null }> = [];

  if (existingEpIds.length > 0) {
    const epIdIn = sql`IN (${sql.join(existingEpIds.map((id) => sql`${id}`), sql`, `)})`;

    const fileRows = await db.query.mediaFile.findMany({
      where: sql`${mediaFile.episodeId} ${epIdIn}`, columns: { id: true, episodeId: true },
    });
    for (const r of fileRows) if (r.episodeId) detachedFiles.push({ rowId: r.id, oldEpisodeId: r.episodeId });
    if (detachedFiles.length > 0) await db.update(mediaFile).set({ episodeId: null }).where(sql`${mediaFile.episodeId} ${epIdIn}`);

    const playbackRows = await db.query.userPlaybackProgress.findMany({
      where: sql`${userPlaybackProgress.episodeId} ${epIdIn}`, columns: { id: true, episodeId: true },
    });
    for (const r of playbackRows) if (r.episodeId) detachedPlayback.push({ rowId: r.id, oldEpisodeId: r.episodeId });
    if (detachedPlayback.length > 0) await db.update(userPlaybackProgress).set({ episodeId: null }).where(sql`${userPlaybackProgress.episodeId} ${epIdIn}`);

    const historyRows = await db.query.userWatchHistory.findMany({
      where: sql`${userWatchHistory.episodeId} ${epIdIn}`, columns: { id: true, episodeId: true },
    });
    for (const r of historyRows) if (r.episodeId) detachedHistory.push({ rowId: r.id, oldEpisodeId: r.episodeId });
    if (detachedHistory.length > 0) await db.update(userWatchHistory).set({ episodeId: null }).where(sql`${userWatchHistory.episodeId} ${epIdIn}`);

    const ratingRows = await db.query.userRating.findMany({
      where: sql`${userRating.episodeId} ${epIdIn}`, columns: { id: true, episodeId: true, seasonId: true },
    });
    for (const r of ratingRows) if (r.episodeId) detachedRatings.push({ rowId: r.id, oldEpisodeId: r.episodeId, oldSeasonId: r.seasonId });
    if (detachedRatings.length > 0) await db.update(userRating).set({ episodeId: null, seasonId: null }).where(sql`${userRating.episodeId} ${epIdIn}`);
  }

  if (existingSeasonIds.length > 0) {
    const seasonIdIn = sql`IN (${sql.join(existingSeasonIds.map((id) => sql`${id}`), sql`, `)})`;
    const seasonRatings = await db.query.userRating.findMany({
      where: and(sql`${userRating.seasonId} ${seasonIdIn}`, sql`${userRating.episodeId} IS NULL`),
      columns: { id: true, seasonId: true },
    });
    for (const r of seasonRatings) if (r.seasonId) detachedRatings.push({ rowId: r.id, oldEpisodeId: "", oldSeasonId: r.seasonId });
    if (seasonRatings.length > 0) await db.update(userRating).set({ seasonId: null }).where(sql`${userRating.seasonId} ${seasonIdIn}`);
  }

  await db.transaction(async (tx) => {
    await tx.delete(season).where(eq(season.mediaId, mediaId));
    await persistSeasons(tx as unknown as Database, mediaId, {
      ...normalized,
      type: "show",
      seasons: tvdbSeasons,
    });
  });

  const tvdbSeasonCount = tvdbSeasons.filter((s) => s.number > 0).length;
  const tvdbEpisodeCount = tvdbSeasons.reduce(
    (sum, s) => sum + (s.episodes?.length ?? 0),
    0,
  );
  await db
    .update(media)
    .set({ numberOfSeasons: tvdbSeasonCount, numberOfEpisodes: tvdbEpisodeCount, updatedAt: new Date() })
    .where(eq(media.id, mediaId));

  const newSeasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    with: {
      episodes: { columns: { id: true, number: true, absoluteNumber: true } },
    },
  });

  const newEpByAbsolute = new Map<number, string>();
  const newEpBySeasonEp = new Map<string, string>();
  const newSeasonIdByNumber = new Map<number, string>();
  for (const s of newSeasons) {
    newSeasonIdByNumber.set(s.number, s.id);
    for (const e of s.episodes) {
      if (e.absoluteNumber != null) newEpByAbsolute.set(e.absoluteNumber, e.id);
      newEpBySeasonEp.set(`${s.number}-${e.number}`, e.id);
    }
  }

  function resolveNewEpId(oldEpId: string): string | undefined {
    const info = epIdentity.get(oldEpId);
    if (!info) return undefined;
    if (info.absoluteNumber != null) {
      const id = newEpByAbsolute.get(info.absoluteNumber);
      if (id) return id;
    }
    return newEpBySeasonEp.get(`${info.seasonNumber}-${info.episodeNumber}`);
  }

  function resolveNewSeasonId(oldSeasonId: string): string | undefined {
    const num = existingSeasons.find((s) => s.id === oldSeasonId)?.number;
    return num != null ? newSeasonIdByNumber.get(num) : undefined;
  }

  for (const r of detachedFiles) {
    const newEpId = resolveNewEpId(r.oldEpisodeId);
    if (newEpId) await db.update(mediaFile).set({ episodeId: newEpId }).where(eq(mediaFile.id, r.rowId));
  }
  for (const r of detachedPlayback) {
    const newEpId = resolveNewEpId(r.oldEpisodeId);
    if (newEpId) await db.update(userPlaybackProgress).set({ episodeId: newEpId }).where(eq(userPlaybackProgress.id, r.rowId));
  }
  for (const r of detachedHistory) {
    const newEpId = resolveNewEpId(r.oldEpisodeId);
    if (newEpId) await db.update(userWatchHistory).set({ episodeId: newEpId }).where(eq(userWatchHistory.id, r.rowId));
  }
  for (const r of detachedRatings) {
    const newEpId = r.oldEpisodeId ? resolveNewEpId(r.oldEpisodeId) : undefined;
    const newSeasonId = r.oldSeasonId ? resolveNewSeasonId(r.oldSeasonId) : undefined;
    if (newEpId || newSeasonId) {
      await db.update(userRating).set({
        ...(newEpId ? { episodeId: newEpId } : {}),
        ...(newSeasonId ? { seasonId: newSeasonId } : {}),
      }).where(eq(userRating.id, r.rowId));
    }
  }

  if (savedSeasonTranslations.length > 0) {
    const seasonTransSeen = new Set<string>();
    const seasonTransRows = savedSeasonTranslations
      .filter((t) => newSeasonIdByNumber.has(t.seasonNumber))
      .map((t) => ({
        seasonId: newSeasonIdByNumber.get(t.seasonNumber)!,
        language: t.language,
        name: t.name,
        overview: t.overview,
      }))
      .filter((r) => {
        const key = `${r.seasonId}-${r.language}`;
        if (seasonTransSeen.has(key)) return false;
        seasonTransSeen.add(key);
        return true;
      });
    for (const r of seasonTransRows) {
      await localization.upsertSeasonLocalization(
        r.seasonId,
        r.language,
        { name: r.name, overview: r.overview },
        "tvdb",
      );
    }
  }

  if (savedEpTranslations.length > 0) {
    const epTransRows: Array<{ episodeId: string; language: string; title: string | null; overview: string | null }> = [];
    const epTransSeen = new Set<string>();
    for (const t of savedEpTranslations) {
      let newEpId: string | undefined;
      if (t.absoluteNumber != null) newEpId = newEpByAbsolute.get(t.absoluteNumber);
      if (!newEpId) newEpId = newEpBySeasonEp.get(`${t.seasonNumber}-${t.episodeNumber}`);
      if (!newEpId) continue;
      const dedupKey = `${newEpId}-${t.language}`;
      if (epTransSeen.has(dedupKey)) continue;
      epTransSeen.add(dedupKey);
      epTransRows.push({ episodeId: newEpId, language: t.language, title: t.title, overview: t.overview });
    }
    for (const r of epTransRows) {
      await localization.upsertEpisodeLocalization(
        r.episodeId,
        r.language,
        { title: r.title, overview: r.overview },
        "tvdb",
      );
    }
  }

  if (normalized.seasons) {
    const tmdbEpMap = buildTmdbEpisodeMap(normalized.seasons);
    await overlayTmdbEpisodeData(db, mediaId, tmdbEpMap);
    await overlayTmdbSeasonData(db, mediaId, normalized.seasons);
  }
}
