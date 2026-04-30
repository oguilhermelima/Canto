/* -------------------------------------------------------------------------- */
/*  Use-case: Detect missing episodes for monitored shows                    */
/* -------------------------------------------------------------------------- */

import { and, eq } from "drizzle-orm";
import type { Database } from "@canto/db/client";
import { mediaFile } from "@canto/db/schema";
import type { MediaRepositoryPort } from "@canto/core/domain/media/ports/media-repository.port";

export interface DetectMissingEpisodesDeps {
  media: MediaRepositoryPort;
}

/**
 * For a given show and season, find episode numbers that don't have
 * an imported media file yet.
 *
 * The `media_file` lookup still hits the DB directly via Drizzle —
 * Wave 8's torrents port covers writes / status flips but not the
 * "any file imported for this episode?" projection. TODO(wave 8 follow-up):
 * surface a `findImportedByEpisodeId` helper on the torrents port and
 * inject it here.
 */
export async function detectMissingEpisodes(
  db: Database,
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

    const existingFile = await db.query.mediaFile.findFirst({
      where: and(
        eq(mediaFile.episodeId, ep.id),
        eq(mediaFile.status, "imported"),
      ),
    });

    if (!existingFile) {
      missingEpisodes.push(epNum);
    }
  }

  return missingEpisodes;
}
