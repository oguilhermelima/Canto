"use client";

import { SeasonTabs } from "~/components/media/season-tabs";

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
    seasons: SeasonItem[];
  };
  availability: { data?: { episodes?: Record<string, Array<{ type: string; resolution?: string | null }>> } };
  mediaServers: { data?: { jellyfin?: { url: string }; plex?: { url: string } } };
}

export function SeasonsSection({
  media,
  availability,
  mediaServers,
}: SeasonsSectionProps): React.JSX.Element | null {
  if (media.type !== "show") return null;

  return (
    <div id="seasons-section">
      <SeasonTabs
        seasons={media.seasons.map((s) => ({
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
