"use client";

import { useState, useCallback, useMemo } from "react";
import { cn } from "@canto/ui/cn";
import { ChevronRight } from "lucide-react";
import { EpisodeCard } from "./episode-card";
import type { Episode, EpisodeDownloadInfo } from "./episode-card";

interface Season {
  id: string;
  seasonNumber: number;
  name: string;
  overview?: string | null;
  episodeCount?: number | null;
  airDate?: string | null;
  posterPath?: string | null;
  episodes?: Episode[];
}

interface SeasonTabsProps {
  seasons: Season[];
  /** External ID of the show (for episode links) */
  showExternalId: string;
  /** Map of episode ID -> download info for showing status indicators */
  downloadedEpisodes?: Map<string, EpisodeDownloadInfo>;
  /** Episode availability from servers: key = "S01E05" -> [{ type, resolution }] */
  episodeAvailability?: Record<string, Array<{ type: string; resolution?: string | null }>>;
  /** Server links for "Watch on" buttons */
  serverLinks?: { jellyfin?: { url: string }; plex?: { url: string } };
  className?: string;
}

export function SeasonTabs({
  seasons,
  showExternalId,
  downloadedEpisodes,
  episodeAvailability,
  serverLinks,
  className,
}: SeasonTabsProps): React.JSX.Element {
  const filteredSeasons = useMemo(
    () =>
      [...seasons]
        .filter((s) => (s.episodes?.length ?? 0) > 0)
        .sort((a, b) => {
          // Specials (season 0) always last
          if (a.seasonNumber === 0 && b.seasonNumber !== 0) return 1;
          if (b.seasonNumber === 0 && a.seasonNumber !== 0) return -1;
          return a.seasonNumber - b.seasonNumber;
        }),
    [seasons],
  );

  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(
    new Set(),
  );

  const toggleExpand = useCallback((seasonId: string) => {
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(seasonId)) next.delete(seasonId);
      else next.add(seasonId);
      return next;
    });
  }, []);

  if (filteredSeasons.length === 0) return <></>;

  return (
    <section className={cn("relative", className)}>
      {/* Title */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Seasons</h2>
      </div>

      <div className="flex flex-col gap-4">
        {filteredSeasons.map((season) => (
          <SeasonBlock
            key={season.id}
            season={season}
            showExternalId={showExternalId}
            isExpanded={expandedSeasons.has(season.id)}
            downloadedEpisodes={downloadedEpisodes}
            episodeAvailability={episodeAvailability}
            serverLinks={serverLinks}
            onToggleExpand={() => toggleExpand(season.id)}
          />
        ))}
      </div>
    </section>
  );
}

/* ─── Season Block ─── */

function SeasonBlock({
  season,
  showExternalId,
  isExpanded,
  downloadedEpisodes,
  episodeAvailability,
  serverLinks,
  onToggleExpand,
}: {
  season: Season;
  showExternalId: string;
  isExpanded: boolean;
  downloadedEpisodes?: Map<string, EpisodeDownloadInfo>;
  episodeAvailability?: Record<string, Array<{ type: string; resolution?: string | null }>>;
  serverLinks?: { jellyfin?: { url: string }; plex?: { url: string } };
  onToggleExpand: () => void;
}): React.JSX.Element {
  const episodes = useMemo(
    () =>
      (season.episodes ?? []).sort(
        (a, b) => a.episodeNumber - b.episodeNumber,
      ),
    [season.episodes],
  );

  // Count available episodes per server
  const jellyfinEpCount = episodeAvailability
    ? episodes.filter((ep) => {
        const key = `S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
        return episodeAvailability[key]?.some((a) => a.type === "jellyfin");
      }).length
    : 0;
  const plexEpCount = episodeAvailability
    ? episodes.filter((ep) => {
        const key = `S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
        return episodeAvailability[key]?.some((a) => a.type === "plex");
      }).length
    : 0;

  const isSpecials = season.seasonNumber === 0;
  const sNum = String(season.seasonNumber).padStart(2, "0");
  const epCount = episodes.length || season.episodeCount || 0;
  const year = season.airDate
    ? new Date(season.airDate).getFullYear()
    : null;
  const rawTitle = season.name || `Season ${season.seasonNumber}`;
  const seasonTitle = isSpecials
    ? "Specials"
    : rawTitle.replace(
        /^(?:s(?:eason)?\s*0*\d+)\s*[•·\-–—:|]\s*/i,
        "",
      ) || rawTitle;

  return (
    <div className="rounded-xl bg-card p-1">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpand(); } }}
        className="flex cursor-pointer items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4"
      >
        <ChevronRight
          size={20}
          className={cn(
            "shrink-0 text-muted-foreground/50 transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold leading-tight sm:text-base">
            {isSpecials ? (
              <span>{seasonTitle}</span>
            ) : (
              <>
                <span>S{sNum}</span>
                <span className="mx-1.5 text-muted-foreground sm:mx-2">|</span>
                <span>{seasonTitle}</span>
              </>
            )}
          </h3>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <span>{epCount} episodes</span>
            {year && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span>{year}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {/* Server availability badges */}
          {jellyfinEpCount > 0 && serverLinks?.jellyfin && (() => {
            const fullyAvailable = jellyfinEpCount >= epCount;
            const label = fullyAvailable
              ? "Fully available on Jellyfin"
              : `Partially available on Jellyfin (${jellyfinEpCount}/${epCount})`;
            return (
              <a
                href={serverLinks.jellyfin.url}
                target="_blank"
                rel="noopener noreferrer"
                title={label}
                aria-label={label}
                className="hidden h-7 w-7 items-center justify-center rounded-lg border border-[#a95ce0]/20 bg-gradient-to-r from-[#a95ce0]/10 to-[#4bb8e8]/10 transition-colors hover:from-[#a95ce0]/20 hover:to-[#4bb8e8]/20 sm:flex"
              >
                <span
                  className="inline-block h-3.5 w-3.5 shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #a95ce0, #4bb8e8)",
                    mask: "url(/jellyfin-logo.svg) center/contain no-repeat",
                    WebkitMask: "url(/jellyfin-logo.svg) center/contain no-repeat",
                  }}
                />
              </a>
            );
          })()}
          {plexEpCount > 0 && serverLinks?.plex && (() => {
            const fullyAvailable = plexEpCount >= epCount;
            const label = fullyAvailable
              ? "Fully available on Plex"
              : `Partially available on Plex (${plexEpCount}/${epCount})`;
            return (
              <a
                href={serverLinks.plex.url}
                target="_blank"
                rel="noopener noreferrer"
                title={label}
                aria-label={label}
                className="hidden h-7 w-7 items-center justify-center rounded-lg border border-[#e5a00d]/20 bg-[#e5a00d]/10 transition-colors hover:bg-[#e5a00d]/20 sm:flex"
              >
                <span
                  className="inline-block h-3.5 w-3.5 shrink-0 bg-[#e5a00d]"
                  style={{
                    mask: "url(/plex-logo.svg) center/contain no-repeat",
                    WebkitMask: "url(/plex-logo.svg) center/contain no-repeat",
                  }}
                />
              </a>
            );
          })()}
        </div>
      </div>

      {/* Collapsible episodes */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {episodes.length > 0 && (
          <div className="flex gap-3 overflow-x-auto px-3 pb-3 scrollbar-none sm:gap-4 sm:px-4">
            {episodes.map((ep) => (
              <EpisodeCard
                key={ep.id}
                episode={ep}
                seasonNumber={season.seasonNumber}
                showExternalId={showExternalId}
                downloadInfo={downloadedEpisodes?.get(ep.id)}
                serverAvailability={episodeAvailability?.[
                  `S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
                ]}
              />
            ))}
          </div>
        )}

        {episodes.length === 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border/30 py-10 text-xs text-muted-foreground/30">
              No episodes available
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
