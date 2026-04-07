/* -------------------------------------------------------------------------- */
/*  Use-case: Detect missing episodes for monitored shows                    */
/* -------------------------------------------------------------------------- */

import type { Database } from "@canto/db/client";
import { and, eq } from "drizzle-orm";
import { mediaFile } from "@canto/db/schema";
import { findMediaByIdWithSeasons } from "../../infrastructure/repositories";

/**
 * For a given show and season, find episode numbers that don't have
 * an imported media file yet.
 */
export async function detectMissingEpisodes(
  db: Database,
  mediaId: string,
  seasonNumber: number,
  targetEpisodes: number[],
): Promise<number[]> {
  const mediaRow = await findMediaByIdWithSeasons(db, mediaId);
  if (!mediaRow) return [];

  const seasonRow = mediaRow.seasons?.find((s) => s.number === seasonNumber);
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
