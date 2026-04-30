import type { Database } from "@canto/db/client";
import { findMediaVersionsWithEpisodes } from "@canto/core/infra/media/media-version-repository";

/**
 * Get media availability across all sources (downloads, Jellyfin, Plex).
 * Returns source-level info + episode-level availability for shows. Each
 * media_version is one physical file on one server — we surface them 1:1.
 */
export async function getMediaAvailability(db: Database, mediaId: string) {
  const versions = await findMediaVersionsWithEpisodes(db, mediaId);

  const sources: Array<{
    type: "jellyfin" | "plex";
    resolution?: string | null;
    videoCodec?: string | null;
    episodeCount?: number;
  }> = [];

  const episodeMap: Record<string, Array<{ type: string; resolution?: string | null }>> = {};

  for (const version of versions) {
    const srcType = version.source as "jellyfin" | "plex";

    // Movies carry their quality directly on the version row; episodes, if
    // any, live in media_version_episode children.
    if (version.episodes.length === 0) {
      sources.push({
        type: srcType,
        resolution: version.resolution,
        videoCodec: version.videoCodec,
      });
      continue;
    }

    // Show: summarize with the first episode's quality.
    const first = version.episodes[0];
    sources.push({
      type: srcType,
      resolution: first?.resolution ?? version.resolution,
      videoCodec: first?.videoCodec ?? version.videoCodec,
      episodeCount: version.episodes.length,
    });

    for (const ep of version.episodes) {
      if (ep.seasonNumber == null || ep.episodeNumber == null) continue;
      const key = `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
      if (!episodeMap[key]) episodeMap[key] = [];
      episodeMap[key].push({ type: srcType, resolution: ep.resolution });
    }
  }

  return { sources, episodes: episodeMap };
}
