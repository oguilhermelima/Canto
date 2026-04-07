import type { Database } from "@canto/db/client";
import { findSyncItemsWithEpisodes } from "../../infrastructure/repositories/sync-repository";

/**
 * Get media availability across all sources (downloads, Jellyfin, Plex).
 * Returns source-level info + episode-level availability for shows.
 */
export async function getMediaAvailability(db: Database, mediaId: string) {
  const items = await findSyncItemsWithEpisodes(db, mediaId);

  const sources: Array<{
    type: "jellyfin" | "plex";
    resolution?: string | null;
    videoCodec?: string | null;
    episodeCount?: number;
  }> = [];

  const episodeMap: Record<string, Array<{ type: string; resolution?: string | null }>> = {};

  for (const item of items) {
    if (!item.source) continue;
    const srcType = item.source as "jellyfin" | "plex";

    if (item.episodes.length === 0) continue;

    // For movies: single episode entry with no season/episode number
    const movieEp = item.episodes.find((e) => e.seasonNumber == null && e.episodeNumber == null);
    if (movieEp) {
      sources.push({
        type: srcType,
        resolution: movieEp.resolution,
        videoCodec: movieEp.videoCodec,
      });
      continue;
    }

    // For shows
    sources.push({
      type: srcType,
      resolution: item.episodes[0]?.resolution,
      videoCodec: item.episodes[0]?.videoCodec,
      episodeCount: item.episodes.length,
    });

    for (const ep of item.episodes) {
      if (ep.seasonNumber == null || ep.episodeNumber == null) continue;
      const key = `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
      if (!episodeMap[key]) episodeMap[key] = [];
      episodeMap[key].push({ type: srcType, resolution: ep.resolution });
    }
  }

  return { sources, episodes: episodeMap };
}
