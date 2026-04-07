"use client";

import { useState } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Server,
} from "lucide-react";
import { epKey } from "./use-manage-media";
import type { SeasonData } from "./content-season-list";

interface ServerSeasonListProps {
  serverName: string;
  serverType: string;
  color: "blue" | "amber";
  mediaType: "movie" | "show";
  seasons: SeasonData[];
  availability:
    | {
        sources: Array<{
          type: string;
          resolution?: string | null;
          videoCodec?: string | null;
          episodeCount?: number;
        }>;
        episodes: Record<
          string,
          Array<{ type: string; resolution?: string | null }>
        >;
      }
    | undefined;
  serverLink: string | undefined;
}

export function ServerSeasonList({
  serverName,
  serverType,
  color,
  mediaType,
  seasons,
  availability,
  serverLink,
}: ServerSeasonListProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const source = availability?.sources.find((s) => s.type === serverType);
  const episodes = availability?.episodes;
  const toggle = (sn: number): void => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(sn)) n.delete(sn);
      else n.add(sn);
      return n;
    });
  };

  const colorClass = color === "blue" ? "text-blue-400" : "text-amber-400";
  const bgClass =
    color === "blue"
      ? "bg-blue-500/15 text-blue-400"
      : "bg-amber-500/15 text-amber-400";

  if (!source) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Server className={cn("h-8 w-8 opacity-40", colorClass)} />
        <p className="text-sm text-muted-foreground">
          Not available on {serverName}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border p-4">
        <div className="flex items-center gap-3">
          <Server className={cn("h-5 w-5", colorClass)} />
          <div>
            <p className="text-sm font-medium">{serverName}</p>
            <p className="text-xs text-muted-foreground">
              {source.resolution ?? "Available"}
              {source.videoCodec && ` \u00b7 ${source.videoCodec}`}
              {mediaType === "show" &&
                source.episodeCount != null &&
                ` \u00b7 ${source.episodeCount} episodes`}
            </p>
          </div>
        </div>
        {serverLink && (
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href={serverLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Open
            </a>
          </Button>
        )}
      </div>

      {mediaType === "show" && seasons.length > 0 && (
        <div className="space-y-2">
          {seasons.map((season) => {
            const isOpen = expanded.has(season.number);
            const eps = season.episodes ?? [];
            const availableEps = eps.filter((ep) => {
              const key = epKey(season.number, ep.number);
              return episodes?.[key]?.some((a) => a.type === serverType);
            });

            return (
              <div
                key={season.id}
                className="rounded-xl border border-border"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(season.number)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(season.number);
                    }
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    {season.number === 0
                      ? "Specials"
                      : `Season ${season.number}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {availableEps.length}/{eps.length} episodes
                  </span>
                </div>
                {isOpen && eps.length > 0 && (
                  <div className="border-t border-border">
                    {eps.map((ep) => {
                      const key = epKey(season.number, ep.number);
                      const epAvail = episodes?.[key]?.filter(
                        (a) => a.type === serverType,
                      );
                      const isAvailable = epAvail && epAvail.length > 0;
                      const res = epAvail?.[0]?.resolution;
                      return (
                        <div
                          key={ep.id}
                          className="flex items-center gap-3 border-b border-border/50 px-4 py-2.5 last:border-b-0"
                        >
                          <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">
                            E{String(ep.number).padStart(2, "0")}
                          </span>
                          <p
                            className={cn(
                              "min-w-0 flex-1 text-sm leading-snug",
                              isAvailable
                                ? "font-medium"
                                : "text-muted-foreground/40",
                            )}
                          >
                            {ep.title ?? `Episode ${ep.number}`}
                          </p>
                          {isAvailable && (
                            <span
                              className={cn(
                                "rounded-xl px-2 py-0.5 text-[10px] font-medium",
                                bgClass,
                              )}
                            >
                              {res ?? "Available"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
