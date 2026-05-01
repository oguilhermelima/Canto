/* -------------------------------------------------------------------------- */
/*  Use-case: Detect missing episodes for monitored shows                    */
/* -------------------------------------------------------------------------- */

import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";
import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";

export interface DetectMissingEpisodesDeps {
  media: MediaRepositoryPort;
  torrents: TorrentsRepositoryPort;
}

/**
 * For a given show and season, find episode numbers that don't have
 * an imported media file yet.
 */
export async function detectMissingEpisodes(
  deps: DetectMissingEpisodesDeps,
  mediaId: string,
  seasonNumber: number,
  targetEpisodes: number[],
): Promise<number[]> {
  const mediaRow = await deps.media.findByIdWithSeasons(mediaId);
  if (!mediaRow) return [];

  const seasonRow = mediaRow.seasons.find((s) => s.number === seasonNumber);
  if (!seasonRow?.episodes) return [];

  const missingEpisodes: number[] = [];
  for (const epNum of targetEpisodes) {
    const ep = seasonRow.episodes.find((e) => e.number === epNum);
    if (!ep) continue;

    const hasImported = await deps.torrents.hasImportedFileForEpisode(ep.id);
    if (!hasImported) {
      missingEpisodes.push(epNum);
    }
  }

  return missingEpisodes;
}
