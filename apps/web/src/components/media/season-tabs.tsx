"use client";

import Image from "next/image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@canto/ui/tabs";
import { Badge } from "@canto/ui/badge";
import { Calendar, Clock, Star } from "lucide-react";

interface Episode {
  id: string;
  episodeNumber: number;
  title: string;
  overview?: string | null;
  stillPath?: string | null;
  airDate?: string | null;
  runtime?: number | null;
  voteAverage?: number | null;
}

interface Season {
  id: string;
  seasonNumber: number;
  name: string;
  episodeCount?: number | null;
  airDate?: string | null;
  posterPath?: string | null;
  episodes?: Episode[];
}

interface SeasonTabsProps {
  seasons: Season[];
  className?: string;
}

export function SeasonTabs({
  seasons,
  className,
}: SeasonTabsProps): React.JSX.Element {
  // Filter out specials (season 0) and sort by season number
  const filteredSeasons = seasons
    .filter((s) => s.seasonNumber > 0)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  if (filteredSeasons.length === 0) {
    return <></>;
  }

  const defaultSeason = filteredSeasons[0]?.seasonNumber.toString() ?? "1";

  return (
    <section className={className}>
      <h2 className="mb-4 text-xl font-semibold text-foreground">
        Seasons & Episodes
      </h2>

      <Tabs defaultValue={defaultSeason} className="w-full">
        <TabsList className="mb-4 h-auto flex-wrap gap-1 bg-transparent">
          {filteredSeasons.map((season) => (
            <TabsTrigger
              key={season.seasonNumber}
              value={season.seasonNumber.toString()}
              className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Season {season.seasonNumber}
            </TabsTrigger>
          ))}
        </TabsList>

        {filteredSeasons.map((season) => (
          <TabsContent
            key={season.seasonNumber}
            value={season.seasonNumber.toString()}
          >
            {/* Season header */}
            <div className="mb-4 flex items-center gap-3">
              <h3 className="text-lg font-medium text-foreground">
                {season.name}
              </h3>
              {season.episodeCount != null && (
                <Badge variant="secondary">
                  {season.episodeCount} episodes
                </Badge>
              )}
              {season.airDate && (
                <span className="text-sm text-muted-foreground">
                  {season.airDate}
                </span>
              )}
            </div>

            {/* Episode list */}
            <div className="space-y-3">
              {season.episodes && season.episodes.length > 0 ? (
                season.episodes
                  .sort((a, b) => a.episodeNumber - b.episodeNumber)
                  .map((episode) => (
                    <div
                      key={episode.id}
                      className="flex gap-4 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/50"
                    >
                      {/* Episode thumbnail */}
                      <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-md bg-muted">
                        {episode.stillPath ? (
                          <Image
                            src={`https://image.tmdb.org/t/p/w500${episode.stillPath}`}
                            alt={episode.title}
                            fill
                            className="object-cover"
                            sizes="144px"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                            E{episode.episodeNumber}
                          </div>
                        )}
                      </div>

                      {/* Episode info */}
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            <span className="text-muted-foreground">
                              {episode.episodeNumber}.{" "}
                            </span>
                            {episode.title}
                          </p>
                        </div>

                        {/* Episode meta */}
                        <div className="mt-1 flex items-center gap-3">
                          {episode.airDate && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {episode.airDate}
                            </span>
                          )}
                          {episode.runtime != null && episode.runtime > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {episode.runtime}m
                            </span>
                          )}
                          {episode.voteAverage != null &&
                            episode.voteAverage > 0 && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                {episode.voteAverage.toFixed(1)}
                              </span>
                            )}
                        </div>

                        {/* Episode overview */}
                        {episode.overview && (
                          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                            {episode.overview}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No episode information available.
                </p>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
