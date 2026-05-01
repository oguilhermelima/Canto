import type { NormalizedMedia, NormalizedSeason } from "@canto/providers";

import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type {
  TvdbEpisodePatch,
  TvdbOverlayRepositoryPort,
} from "@canto/core/domain/media/ports/tvdb-overlay-repository.port";
import { persistSeasons } from "@canto/core/domain/media/use-cases/persist/core";
import type { PersistDeps } from "@canto/core/domain/media/use-cases/persist/core";

interface TvdbOverlayDeps extends Pick<PersistDeps, "media"> {
  localization: MediaLocalizationRepositoryPort;
  tvdbOverlay: TvdbOverlayRepositoryPort;
}

/**
 * Build a flat map of absoluteNumber → TMDB episode data.
 * TMDB seasons are iterated in order (excluding specials/S0), and each
 * episode gets a running absolute index starting at 1.
 */
export function buildTmdbEpisodeMap(
  tmdbSeasons: NormalizedSeason[],
): Map<number, TvdbEpisodePatch> {
  const map = new Map<number, TvdbEpisodePatch>();
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
  deps: { tvdbOverlay: TvdbOverlayRepositoryPort },
  mediaId: string,
  tmdbEpMap: Map<number, TvdbEpisodePatch>,
): Promise<void> {
  if (tmdbEpMap.size === 0) return;

  const seasons = await deps.tvdbOverlay.findStructureWithEpisodes(mediaId);

  const updates: Array<{ id: string; data: TvdbEpisodePatch }> = [];
  for (const s of seasons) {
    for (const ep of s.episodes) {
      if (ep.absoluteNumber === null) continue;
      const tmdb = tmdbEpMap.get(ep.absoluteNumber);
      if (tmdb) updates.push({ id: ep.id, data: tmdb });
    }
  }

  for (const u of updates) {
    await deps.tvdbOverlay.patchEpisode(u.id, u.data);
  }
}

/**
 * Overlay TMDB voteAverage onto TVDB seasons.
 * Uses season number matching (TMDB S1 voteAverage → TVDB seasons).
 * For anime with split seasons (TVDB S1-S17 vs TMDB S1-S2), only
 * TMDB S1 and S2 can match by number. Others keep null.
 */
export async function overlayTmdbSeasonData(
  deps: { tvdbOverlay: TvdbOverlayRepositoryPort },
  mediaId: string,
  tmdbSeasons: NormalizedSeason[],
): Promise<void> {
  const tmdbSeasonByNumber = new Map(
    tmdbSeasons.filter((s) => s.number > 0).map((s) => [s.number, s]),
  );
  if (tmdbSeasonByNumber.size === 0) return;

  const dbSeasons = await deps.tvdbOverlay.findStructureWithEpisodes(mediaId);

  for (const s of dbSeasons) {
    const tmdb = tmdbSeasonByNumber.get(s.number);
    if (tmdb?.voteAverage !== undefined) {
      await deps.tvdbOverlay.patchSeasonVoteAverage(s.id, tmdb.voteAverage);
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
  mediaId: string,
  tvdbSeasons: NormalizedSeason[],
  normalized: NormalizedMedia,
  deps: TvdbOverlayDeps,
): Promise<void> {
  const { tvdbOverlay, localization } = deps;

  const existingSeasons = await tvdbOverlay.findStructureWithEpisodes(mediaId);

  const epIdentity = new Map<
    string,
    { absoluteNumber: number | null; seasonNumber: number; episodeNumber: number }
  >();
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
    const epLocs = await tvdbOverlay.findEpisodeLocalizationsByEpisodeIds(
      existingEpIds,
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
    const sLocs = await tvdbOverlay.findSeasonLocalizationsBySeasonIds(
      existingSeasonIds,
    );
    const seasonNumberById = new Map(
      existingSeasons.map((s) => [s.id, s.number]),
    );
    savedSeasonTranslations = sLocs.map((t) => ({
      seasonNumber: seasonNumberById.get(t.seasonId) ?? 0,
      language: t.language,
      name: t.name,
      overview: t.overview,
    }));
  }

  const detached = await tvdbOverlay.detachAndCollectEpisodeRefs(existingEpIds);
  const detachedSeasonOnlyRatings =
    await tvdbOverlay.detachAndCollectSeasonOnlyRatings(existingSeasonIds);

  await tvdbOverlay.replaceSeasons(mediaId, async () => {
    await persistSeasons(deps, mediaId, {
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
  await tvdbOverlay.updateMediaSeasonCounts(
    mediaId,
    tvdbSeasonCount,
    tvdbEpisodeCount,
  );

  const newSeasons = await tvdbOverlay.findStructureWithEpisodes(mediaId);

  const newEpByAbsolute = new Map<number, string>();
  const newEpBySeasonEp = new Map<string, string>();
  const newSeasonIdByNumber = new Map<number, string>();
  for (const s of newSeasons) {
    newSeasonIdByNumber.set(s.number, s.id);
    for (const e of s.episodes) {
      if (e.absoluteNumber !== null) newEpByAbsolute.set(e.absoluteNumber, e.id);
      newEpBySeasonEp.set(`${s.number}-${e.number}`, e.id);
    }
  }

  function resolveNewEpId(oldEpId: string): string | undefined {
    const info = epIdentity.get(oldEpId);
    if (!info) return undefined;
    if (info.absoluteNumber !== null) {
      const id = newEpByAbsolute.get(info.absoluteNumber);
      if (id) return id;
    }
    return newEpBySeasonEp.get(`${info.seasonNumber}-${info.episodeNumber}`);
  }

  function resolveNewSeasonId(oldSeasonId: string): string | undefined {
    const num = existingSeasons.find((s) => s.id === oldSeasonId)?.number;
    return num !== undefined ? newSeasonIdByNumber.get(num) : undefined;
  }

  for (const r of detached.files) {
    const newEpId = resolveNewEpId(r.oldEpisodeId);
    if (newEpId) await tvdbOverlay.reattachMediaFile(r.rowId, newEpId);
  }
  for (const r of detached.playback) {
    const newEpId = resolveNewEpId(r.oldEpisodeId);
    if (newEpId) await tvdbOverlay.reattachUserPlayback(r.rowId, newEpId);
  }
  for (const r of detached.history) {
    const newEpId = resolveNewEpId(r.oldEpisodeId);
    if (newEpId) await tvdbOverlay.reattachUserWatchHistory(r.rowId, newEpId);
  }
  for (const r of detached.ratings) {
    const newEpId = resolveNewEpId(r.oldEpisodeId);
    const newSeasonId = r.oldSeasonId
      ? resolveNewSeasonId(r.oldSeasonId)
      : undefined;
    if (newEpId || newSeasonId) {
      await tvdbOverlay.reattachUserRating(r.rowId, {
        ...(newEpId ? { episodeId: newEpId } : {}),
        ...(newSeasonId ? { seasonId: newSeasonId } : {}),
      });
    }
  }
  for (const r of detachedSeasonOnlyRatings) {
    const newSeasonId = resolveNewSeasonId(r.oldSeasonId);
    if (newSeasonId) {
      await tvdbOverlay.reattachUserRating(r.rowId, { seasonId: newSeasonId });
    }
  }

  if (savedSeasonTranslations.length > 0) {
    const seasonTransSeen = new Set<string>();
    const seasonTransRows = savedSeasonTranslations
      .map((t) => {
        const seasonId = newSeasonIdByNumber.get(t.seasonNumber);
        return seasonId === undefined
          ? null
          : {
              seasonId,
              language: t.language,
              name: t.name,
              overview: t.overview,
            };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
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
    const epTransRows: Array<{
      episodeId: string;
      language: string;
      title: string | null;
      overview: string | null;
    }> = [];
    const epTransSeen = new Set<string>();
    for (const t of savedEpTranslations) {
      const fromAbs =
        t.absoluteNumber !== null
          ? newEpByAbsolute.get(t.absoluteNumber)
          : undefined;
      const newEpId =
        fromAbs ?? newEpBySeasonEp.get(`${t.seasonNumber}-${t.episodeNumber}`);
      if (!newEpId) continue;
      const dedupKey = `${newEpId}-${t.language}`;
      if (epTransSeen.has(dedupKey)) continue;
      epTransSeen.add(dedupKey);
      epTransRows.push({
        episodeId: newEpId,
        language: t.language,
        title: t.title,
        overview: t.overview,
      });
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
    await overlayTmdbEpisodeData(deps, mediaId, tmdbEpMap);
    await overlayTmdbSeasonData(deps, mediaId, normalized.seasons);
  }
}
