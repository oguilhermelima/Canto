import { TvdbProvider } from "@canto/providers";

import type { LoggerPort } from "@canto/core/domain/shared/ports/logger.port";
import type { MediaLocalizationRepositoryPort } from "@canto/core/domain/media/ports/media-localization-repository.port";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";

export interface TranslateEpisodesDeps {
  localization: MediaLocalizationRepositoryPort;
  media: MediaRepositoryPort;
  logger: LoggerPort;
}

/**
 * Fetch episode + season translations for a single language from TVDB.
 * Designed to run as a background job — one job per (mediaId, language) pair.
 */
export async function translateEpisodes(
  deps: TranslateEpisodesDeps,
  mediaId: string,
  tvdbId: number,
  language: string,
  tvdb: TvdbProvider,
): Promise<void> {
  const { localization, media, logger } = deps;

  const lang3 = TvdbProvider.toIso639_2(language);
  if (lang3 === "eng") return;

  let localEpisodes: Array<{
    name: string | null;
    overview: string | null;
    number: number;
    seasonNumber: number;
  }> = [];
  try {
    localEpisodes = await fetchAllEpisodes(tvdb, tvdbId, lang3);
  } catch (err) {
    logger.warn("translate-episodes: TVDB returned no episodes", {
      tvdbId,
      lang: lang3,
      err: err instanceof Error ? err.message : err,
    });
    return;
  }

  if (localEpisodes.length === 0) return;

  // Fetch season + episode structure for this media via the media port.
  const withSeasons = await media.findByIdWithSeasons(mediaId);
  if (!withSeasons) return;
  const seasons = withSeasons.seasons.map((s) => ({
    id: s.id,
    number: s.number,
    externalId: s.externalId,
  }));

  // Season translations from TVDB
  const seasonTransRows: Array<{
    seasonId: string;
    language: string;
    name: string | null;
    overview: string | null;
  }> = [];
  await Promise.allSettled(
    seasons
      .filter((s) => s.externalId)
      .map(async (s) => {
        try {
          const t: { name?: string; overview?: string } = await tvdb.request(
            `/seasons/${s.externalId}/translations/${lang3}`,
          );
          if (t.name ?? t.overview) {
            seasonTransRows.push({
              seasonId: s.id,
              language,
              name: t.name ?? null,
              overview: t.overview ?? null,
            });
          }
        } catch {
          /* no translation */
        }
      }),
  );

  // Dedup + batch upsert season translations
  if (seasonTransRows.length > 0) {
    const sSeen = new Set<string>();
    const dedupedSeasonTrans = seasonTransRows.filter((r) => {
      const key = `${r.seasonId}-${r.language}`;
      if (sSeen.has(key)) return false;
      sSeen.add(key);
      return true;
    });
    for (const r of dedupedSeasonTrans) {
      await localization.upsertSeasonLocalization(
        r.seasonId,
        r.language,
        { name: r.name, overview: r.overview },
        "tvdb",
      );
    }
  }

  // Build episode ID lookup: "seasonNum-epNum" → episodeId
  const episodeLookup = new Map<string, string>();
  for (const s of withSeasons.seasons) {
    for (const ep of s.episodes) {
      episodeLookup.set(`${s.number}-${ep.number}`, ep.id);
    }
  }

  // Map TVDB episodes to translation rows
  const epTransRows: Array<{
    episodeId: string;
    language: string;
    title: string | null;
    overview: string | null;
  }> = [];
  const epSeen = new Set<string>();
  for (const ep of localEpisodes) {
    if (!ep.name && !ep.overview) continue;
    const epId = episodeLookup.get(`${ep.seasonNumber}-${ep.number}`);
    if (!epId) continue;
    const dedupKey = `${epId}-${language}`;
    if (epSeen.has(dedupKey)) continue;
    epSeen.add(dedupKey);
    epTransRows.push({
      episodeId: epId,
      language,
      title: ep.name ?? null,
      overview: ep.overview ?? null,
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

  logger.info?.("translate-episodes: translated", {
    language,
    seasons: seasonTransRows.length,
    episodes: epTransRows.length,
  });
}

// ── Helpers ──

type EpRow = {
  name: string | null;
  overview: string | null;
  number: number;
  seasonNumber: number;
};

const TVDB_PAGE_SIZE = 500;

async function fetchAllEpisodes(
  tvdb: TvdbProvider,
  seriesId: number,
  lang: string,
): Promise<EpRow[]> {
  const all: EpRow[] = [];
  let page = 0;

  while (true) {
    const data: { episodes: EpRow[] } = await tvdb.request(
      `/series/${seriesId}/episodes/default/${lang}?page=${page}`,
    );
    const episodes = data.episodes;
    if (episodes.length === 0) break;
    all.push(...episodes);
    if (episodes.length < TVDB_PAGE_SIZE) break;
    page++;
  }

  return all;
}
