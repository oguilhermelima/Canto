"use client";

import { useMemo } from "react";
import { SeasonTabs } from "@/components/media/season-tabs";
import { trpc } from "@/lib/trpc/client";

function hasScheduledEpisode(episodes: Array<{ airDate: string | null }>): boolean {
  return episodes.some((episode) => {
    if (!episode.airDate) return false;
    const parsed = new Date(episode.airDate);
    return !Number.isNaN(parsed.getTime());
  });
}

function seasonHasData(season: {
  airDate: string | null;
  episodes: Array<{ airDate: string | null }>;
}): boolean {
  if (season.airDate) {
    const parsed = new Date(season.airDate);
    if (!Number.isNaN(parsed.getTime())) return true;
  }
  return hasScheduledEpisode(season.episodes);
}

interface SeasonEpisode {
  id: string;
  number: number;
  title: string | null;
  overview: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtime: number | null;
  voteAverage: number | null;
}

interface SeasonItem {
  id: string;
  number: number;
  name: string | null;
  overview: string | null;
  episodeCount: number | null;
  airDate: string | null;
  posterPath: string | null;
  episodes: SeasonEpisode[];
}

interface SeasonsSectionProps {
  media: {
    type: string;
    externalId: number;
    seasons: SeasonItem[];
  };
  mediaId?: string;
  availability: { data?: { episodes?: Record<string, Array<{ type: string; resolution?: string | null }>> } };
  mediaServers: { data?: { jellyfin?: { url: string }; plex?: { url: string } } };
}

export function SeasonsSection({
  media,
  mediaId,
  availability,
  mediaServers,
}: SeasonsSectionProps): React.JSX.Element | null {
  if (media.type !== "show") return null;

  const { data: userRatings } = trpc.userMedia.getRatings.useQuery(
    { mediaId: mediaId! },
    { enabled: !!mediaId },
  );

  const userRatingMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!userRatings) return map;
    for (const r of userRatings) {
      if (r.episodeId) map.set(r.episodeId, r.rating);
    }
    return map;
  }, [userRatings]);

  const visibleSeasons = useMemo(
    () => media.seasons.filter((s) => seasonHasData(s)),
    [media.seasons],
  );

  if (visibleSeasons.length === 0) return null;

  return (
    <div id="seasons-section">
      <SeasonTabs
        showExternalId={String(media.externalId)}
        userRatings={userRatingMap}
        seasons={visibleSeasons.map((s) => ({
          id: s.id,
          seasonNumber: s.number,
          name: s.name ?? `Season ${s.number}`,
          overview: s.overview,
          episodeCount: s.episodeCount,
          airDate: s.airDate,
          posterPath: s.posterPath,
          episodes: s.episodes.map((e) => ({
            id: e.id,
            episodeNumber: e.number,
            title: e.title ?? `Episode ${e.number}`,
            overview: e.overview,
            stillPath: e.stillPath,
            airDate: e.airDate,
            runtime: e.runtime,
            voteAverage: e.voteAverage,
          })),
        }))}
        episodeAvailability={availability.data?.episodes}
        serverLinks={mediaServers.data}
      />
    </div>
  );
}
