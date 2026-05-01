import type { TorrentsRepositoryPort } from "@canto/core/domain/torrents/ports/torrents-repository.port";

export interface EpisodeRef {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
}

export interface MediaRowForDuplicates {
  type: string;
  /**
   * Display title used in duplicate-error messages. Optional because the base
   * media row no longer carries one — callers that surface user-facing
   * messages should populate this from the en-US localization, otherwise the
   * detector falls back to a neutral "(${quality} ${source})" descriptor.
   */
  title?: string | null;
  seasons?: Array<{
    number: number;
    episodes?: Array<{ id: string; number: number }>;
  }>;
}

/**
 * Resolve episode IDs from parsed season / episode numbers against the
 * media's season/episode tree.
 */
export function resolveEpisodeIds(
  mediaRow: MediaRowForDuplicates,
  parsedSeasons: number[],
  parsedEpisodes: number[],
): EpisodeRef[] {
  const episodeIds: EpisodeRef[] = [];

  if (mediaRow.type === "show") {
    for (const seasonNum of parsedSeasons) {
      const seasonRow = mediaRow.seasons?.find((s) => s.number === seasonNum);
      if (!seasonRow?.episodes) continue;

      if (parsedEpisodes.length > 0) {
        for (const epNum of parsedEpisodes) {
          const ep = seasonRow.episodes.find((e) => e.number === epNum);
          if (ep)
            episodeIds.push({
              id: ep.id,
              seasonNumber: seasonNum,
              episodeNumber: epNum,
            });
        }
      } else {
        for (const ep of seasonRow.episodes) {
          episodeIds.push({
            id: ep.id,
            seasonNumber: seasonNum,
            episodeNumber: ep.number,
          });
        }
      }
    }
  }

  return episodeIds;
}

/**
 * Detect duplicate media files (same media + quality + source already imported).
 * Returns a list of human-readable duplicate descriptors; empty when no
 * duplicates are detected.
 */
export async function detectDuplicates(
  torrents: TorrentsRepositoryPort,
  mediaRow: MediaRowForDuplicates & { id?: string },
  mediaId: string,
  quality: string,
  source: string,
  episodeIds: EpisodeRef[],
): Promise<string[]> {
  const duplicates: string[] = [];

  if (mediaRow.type === "movie") {
    const existingFile = await torrents.findDuplicateMovieFile(
      mediaId,
      quality,
      source,
    );
    if (existingFile) {
      const label = mediaRow.title
        ? `${mediaRow.title} (${quality} ${source})`
        : `(${quality} ${source})`;
      duplicates.push(label);
    }
  } else {
    for (const ep of episodeIds) {
      const existingFile = await torrents.findDuplicateEpisodeFile(
        ep.id,
        quality,
        source,
      );
      if (existingFile) {
        duplicates.push(
          `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`,
        );
      }
    }
  }

  return duplicates;
}
