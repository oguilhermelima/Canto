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
import { trpc } from "~/lib/trpc/client";
import { epKey } from "./use-manage-media";
import type { SeasonData } from "./content-season-list";
import type { useManageMedia } from "./use-manage-media";

type ManageData = ReturnType<typeof useManageMedia>;

const SERVERS = {
  jellyfin: { name: "Jellyfin", color: "blue" },
  plex: { name: "Plex", color: "amber" },
} as const;

type ServerType = keyof typeof SERVERS;

interface ServersTabProps {
  mediaType: "movie" | "show";
  seasons: SeasonData[];
  availability: ManageData["availability"];
  mediaServers: ManageData["mediaServers"];
}

export function ServersTab({
  mediaType,
  seasons,
  availability,
  mediaServers,
}: ServersTabProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const { data: enabledServices } =
    trpc.settings.getEnabledServices.useQuery();

  const configuredServers = (Object.keys(SERVERS) as ServerType[]).filter(
    (s) => enabledServices?.[s] === true,
  );

  if (configuredServers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No media servers configured.
        </p>
      </div>
    );
  }

  const serverData = configuredServers.map((type) => ({
    type,
    ...SERVERS[type],
    source: availability?.sources.find((s) => s.type === type),
    link: mediaServers?.[type]?.url,
  }));

  const availableServers = serverData.filter((s) => s.source);

  if (availableServers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Server className="h-8 w-8 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">
          Not available on any media server
        </p>
      </div>
    );
  }

  const toggle = (sn: number): void => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(sn)) n.delete(sn);
      else n.add(sn);
      return n;
    });
  };

  const episodes = availability?.episodes;
  const showServerName = availableServers.length > 1;

  return (
    <div className="space-y-4">
      {/* Server summary cards */}
      <div
        className={cn(
          "grid gap-3",
          availableServers.length > 1 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {availableServers.map((server) => {
          const colorClass =
            server.color === "blue" ? "text-blue-400" : "text-amber-400";
          return (
            <div
              key={server.type}
              className="flex items-center justify-between rounded-xl border border-border p-4"
            >
              <div className="flex items-center gap-3">
                <Server className={cn("h-5 w-5", colorClass)} />
                <div>
                  <p className="text-sm font-medium">{server.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {server.source?.resolution ?? "Available"}
                    {server.source?.videoCodec &&
                      ` \u00b7 ${server.source.videoCodec}`}
                    {mediaType === "show" &&
                      server.source?.episodeCount != null &&
                      ` \u00b7 ${server.source.episodeCount} episodes`}
                  </p>
                </div>
              </div>
              {server.link && (
                <Button variant="outline" size="sm" className="gap-2" asChild>
                  <a
                    href={server.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" /> Open
                  </a>
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Season accordion */}
      {mediaType === "show" && seasons.length > 0 && (
        <div className="space-y-2">
          {seasons.map((season) => {
            const isOpen = expanded.has(season.number);
            const eps = season.episodes;
            const availableEps = eps.filter((ep) => {
              const key = epKey(season.number, ep.number);
              return availableServers.some((s) =>
                episodes?.[key]?.some((a) => a.type === s.type),
              );
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
                      const epEntries = episodes?.[key];
                      const epServers = availableServers
                        .map((s) => {
                          const avail = epEntries?.find(
                            (a) => a.type === s.type,
                          );
                          if (!avail) return null;
                          return {
                            type: s.type,
                            name: s.name,
                            color: s.color,
                            resolution: avail.resolution,
                          };
                        })
                        .filter(
                          (s): s is NonNullable<typeof s> => s !== null,
                        );

                      const isAvailable = epServers.length > 0;

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
                          {epServers.map((s) => (
                            <span
                              key={s.type}
                              className={cn(
                                "shrink-0 rounded-xl px-2 py-0.5 text-[10px] font-medium",
                                s.color === "blue"
                                  ? "bg-blue-500/15 text-blue-400"
                                  : "bg-amber-500/15 text-amber-400",
                              )}
                            >
                              {showServerName && `${s.name} \u00b7 `}
                              {s.resolution ?? "Available"}
                            </span>
                          ))}
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
