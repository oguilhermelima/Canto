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
    if (item.episodes.length === 0) continue;

    // Group episodes by their source (unified items may have episodes from both servers)
    const episodesBySource = new Map<string, typeof item.episodes>();
    for (const ep of item.episodes) {
      // ep.source is authoritative; fall back to item.source for legacy rows
      const src = ep.source ?? item.source;
      if (!src) continue;
      if (!episodesBySource.has(src)) episodesBySource.set(src, []);
      episodesBySource.get(src)!.push(ep);
    }

    for (const [src, eps] of episodesBySource) {
      const srcType = src as "jellyfin" | "plex";

      // For movies: single episode entry with no season/episode number
      const movieEp = eps.find((e) => e.seasonNumber == null && e.episodeNumber == null);
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
        resolution: eps[0]?.resolution,
        videoCodec: eps[0]?.videoCodec,
        episodeCount: eps.length,
      });

      for (const ep of eps) {
        if (ep.seasonNumber == null || ep.episodeNumber == null) continue;
        const key = `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
        if (!episodeMap[key]) episodeMap[key] = [];
        episodeMap[key].push({ type: srcType, resolution: ep.resolution });
      }
    }
  }

  return { sources, episodes: episodeMap };
}
