"use client";

import { Calendar, Clock, Star } from "lucide-react";

interface EpisodeInfoProps {
  episode: {
    title: string | null;
    airDate?: string | null;
    runtime?: number | null;
    voteAverage?: number | null;
    number: number;
    finaleType?: string | null;
    episodeType?: string | null;
  };
  sNum: string;
  eNum: string;
  seasonNum: number;
  variant: "hero" | "body";
}

export function EpisodeInfo({
  episode,
  sNum,
  eNum,
  seasonNum,
  variant,
}: EpisodeInfoProps): React.JSX.Element {
  const isHero = variant === "hero";
  return (
    <>
      <div className={`flex items-center gap-2 text-sm ${isHero ? "text-white/70" : "text-muted-foreground"}`}>
        <span className={`font-semibold ${isHero ? "text-white" : "text-foreground"}`}>
          S{sNum}E{eNum}
        </span>
        <span className={isHero ? "text-white/40" : "text-muted-foreground"}>|</span>
        <span>Season {seasonNum}</span>
      </div>

      <h1 className={`mt-2 max-w-3xl text-2xl font-bold tracking-tight ${isHero ? "text-white md:text-4xl" : "text-foreground"}`}>
        {episode.title || `Episode ${episode.number}`}
      </h1>

      <div className={`mt-3 flex flex-wrap items-center gap-4 text-sm ${isHero ? "text-white/70" : "text-muted-foreground"}`}>
        {episode.airDate && (
          <div className="flex items-center gap-1.5">
            <Calendar size={14} />
            {new Date(episode.airDate).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        )}
        {episode.runtime != null && episode.runtime > 0 && (
          <div className="flex items-center gap-1.5">
            <Clock size={14} />
            {episode.runtime}min
          </div>
        )}
        {episode.voteAverage != null && episode.voteAverage > 0 && (
          <div className="flex items-center gap-1.5" title="TMDB rating">
            <Star size={14} className="fill-yellow-500 text-yellow-500" />
            <span>{episode.voteAverage.toFixed(1)}</span>
            <span className={isHero ? "text-white/40" : "text-muted-foreground"}>TMDB</span>
          </div>
        )}
        {(episode.finaleType === "series" || episode.finaleType === "season" || episode.episodeType === "finale") && (
          <span className="rounded-md bg-amber-500/90 px-2 py-0.5 text-xs font-bold text-black">
            {episode.finaleType === "series" ? "Series Finale" : "Finale"}
          </span>
        )}
      </div>
    </>
  );
}
