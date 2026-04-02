import { eq, sql } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { episode, episodeTranslation, season, seasonTranslation } from "@canto/db/schema";
import { TvdbProvider } from "@canto/providers";

/**
 * Fetch episode + season translations for a single language from TVDB.
 * Designed to run as a background job — one job per (mediaId, language) pair.
 */
export async function translateEpisodes(
  db: Database,
  mediaId: string,
  tvdbId: number,
  language: string,
  tvdb: TvdbProvider,
): Promise<void> {
  const lang3 = TvdbProvider.toIso639_2(language);
  if (lang3 === "eng") return;

  // Fetch episodes in the target language from TVDB
  let localEpisodes: Array<{ name: string | null; overview: string | null; number: number; seasonNumber: number }> = [];
  try {
    localEpisodes = await fetchAllEpisodes(tvdb, tvdbId, lang3);
  } catch (err) {
    console.warn(`[translate-episodes] TVDB returned no episodes for ${tvdbId} in ${lang3}:`, err instanceof Error ? err.message : err);
    return;
  }

  if (localEpisodes.length === 0) return;

  // Fetch season translations for this language
  const seasons = await db.query.season.findMany({
    where: eq(season.mediaId, mediaId),
    columns: { id: true, number: true, externalId: true },
  });

  // Season translations from TVDB
  const seasonTransRows: Array<{ seasonId: string; language: string; name: string | null; overview: string | null }> = [];
  await Promise.allSettled(
    seasons.filter((s) => s.externalId).map(async (s) => {
      try {
        const t: { name?: string; overview?: string } = await tvdb.request(
          `/seasons/${s.externalId}/translations/${lang3}`,
        );
        if (t?.name || t?.overview) {
          seasonTransRows.push({
            seasonId: s.id,
            language,
            name: t.name ?? null,
            overview: t.overview ?? null,
          });
        }
      } catch { /* no translation */ }
    }),
  );

  // Batch upsert season translations
  if (seasonTransRows.length > 0) {
    await db
      .insert(seasonTranslation)
      .values(seasonTransRows)
      .onConflictDoUpdate({
        target: [seasonTranslation.seasonId, seasonTranslation.language],
        set: { name: sql`EXCLUDED.name`, overview: sql`EXCLUDED.overview` },
      });
  }

  // Build episode ID lookup: "seasonNum-epNum" → episodeId
  const seasonIdByNumber = new Map(seasons.map((s) => [s.number, s.id]));
  const allEpisodes = await db.query.episode.findMany({
    where: sql`${episode.seasonId} IN (${sql.join([...seasonIdByNumber.values()].map((id) => sql`${id}`), sql`, `)})`,
    columns: { id: true, seasonId: true, number: true },
  });

  const seasonNumById = new Map<string, number>();
  for (const [num, id] of seasonIdByNumber) seasonNumById.set(id, num);

  const episodeLookup = new Map<string, string>();
  for (const ep of allEpisodes) {
    const sNum = seasonNumById.get(ep.seasonId);
    if (sNum !== undefined) episodeLookup.set(`${sNum}-${ep.number}`, ep.id);
  }

  // Map TVDB episodes to translation rows
  const epTransRows: Array<{ episodeId: string; language: string; title: string | null; overview: string | null }> = [];
  for (const ep of localEpisodes) {
    if (!ep.name && !ep.overview) continue;
    const epId = episodeLookup.get(`${ep.seasonNumber}-${ep.number}`);
    if (!epId) continue;
    epTransRows.push({
      episodeId: epId,
      language,
      title: ep.name ?? null,
      overview: ep.overview ?? null,
    });
  }

  // Batch upsert episode translations
  for (let i = 0; i < epTransRows.length; i += 500) {
    await db
      .insert(episodeTranslation)
      .values(epTransRows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: [episodeTranslation.episodeId, episodeTranslation.language],
        set: { title: sql`EXCLUDED.title`, overview: sql`EXCLUDED.overview` },
      });
  }

  console.log(
    `[translate-episodes] ${language}: ${seasonTransRows.length} seasons, ${epTransRows.length} episodes translated`,
  );
}

// ── Helpers ──

type EpRow = { name: string | null; overview: string | null; number: number; seasonNumber: number };

async function fetchAllEpisodes(
  tvdb: TvdbProvider,
  seriesId: number,
  lang: string,
): Promise<EpRow[]> {
  const all: EpRow[] = [];
  let page = 0;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const data: { episodes: EpRow[] } = await tvdb.request(
      `/series/${seriesId}/episodes/default/${lang}?page=${page}`,
    );
    const episodes = data?.episodes ?? [];
    if (episodes.length === 0) break;
    all.push(...episodes);
    if (episodes.length < 500) break;
    page++;
  }

  return all;
}
