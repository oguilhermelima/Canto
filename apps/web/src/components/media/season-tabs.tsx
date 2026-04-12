"use client";

import { useState, useCallback, useMemo } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@canto/ui/dialog";
import { Input } from "@canto/ui/input";
import {
  Search,
  Check,
  X,
  Minus,
  ChevronRight,
  Download,
  Search as SearchIcon,
} from "lucide-react";
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

interface Library {
  id: string;
  name: string;
}

interface MediaConfig {
  libraryId: string | null;
  libraryPath: string | null;
  continuousDownload: boolean;
  libraries: Library[];
  onLibraryChange: (libraryId: string | null) => void;
  onContinuousDownloadChange: (enabled: boolean) => void;
  onCustomSearch?: (query: string) => void;
}

interface SeasonTabsProps {
  seasons: Season[];
  onDownloadSeasons?: (seasonNumbers: number[]) => void;
  onDownloadEpisodes?: (
    seasonNumber: number,
    episodeNumbers: number[],
  ) => void;
  hideFloatingBar?: boolean;
  /** Map of episode ID -> download info for showing status indicators */
  downloadedEpisodes?: Map<string, EpisodeDownloadInfo>;
  /** Media config panel above seasons */
  mediaConfig?: MediaConfig;
  /** Callback to open the preferences modal */
  onOpenPreferences?: () => void;
  /** Episode availability from servers: key = "S01E05" -> [{ type, resolution }] */
  episodeAvailability?: Record<string, Array<{ type: string; resolution?: string | null }>>;
  /** Server links for "Watch on" buttons */
  serverLinks?: { jellyfin?: { url: string }; plex?: { url: string } };
  className?: string;
}

export function SeasonTabs({
  seasons,
  onDownloadSeasons,
  onDownloadEpisodes,
  hideFloatingBar = false,
  downloadedEpisodes,
  mediaConfig,
  onOpenPreferences: _onOpenPreferences,
  episodeAvailability,
  serverLinks,
  className,
}: SeasonTabsProps): React.JSX.Element {
  const filteredSeasons = useMemo(
    () => [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber),
    [seasons],
  );

  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(
    new Set(),
  );
  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(
    new Set(),
  );
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(
    new Set(),
  );

  const [customSearchOpen, setCustomSearchOpen] = useState(false);
  const [customSearchQuery, setCustomSearchQuery] = useState("");

  const toggleExpand = useCallback((seasonId: string) => {
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(seasonId)) next.delete(seasonId);
      else next.add(seasonId);
      return next;
    });
  }, []);

  const toggleSeasonSelect = useCallback(
    (season: Season) => {
      const sn = season.seasonNumber;
      const wasSelected = selectedSeasons.has(sn);
      setSelectedSeasons((prev) => {
        const next = new Set(prev);
        if (wasSelected) next.delete(sn);
        else next.add(sn);
        return next;
      });
      if (!wasSelected && season.episodes) {
        setSelectedEpisodes((prev) => {
          const next = new Set(prev);
          for (const ep of season.episodes!) next.delete(ep.id);
          return next;
        });
      }
    },
    [selectedSeasons],
  );

  const toggleEpisode = useCallback((episodeId: string) => {
    setSelectedEpisodes((prev) => {
      const next = new Set(prev);
      if (next.has(episodeId)) next.delete(episodeId);
      else next.add(episodeId);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelectedSeasons(new Set());
    setSelectedEpisodes(new Set());
  }, []);

  const allSeasonsSelected =
    filteredSeasons.length > 0 &&
    filteredSeasons.every((s) => selectedSeasons.has(s.seasonNumber));

  const selectAllSeasons = useCallback(() => {
    if (allSeasonsSelected) {
      setSelectedSeasons(new Set());
    } else {
      setSelectedSeasons(
        new Set(filteredSeasons.map((s) => s.seasonNumber)),
      );
      // Clear individual episode selections
      setSelectedEpisodes(new Set());
    }
  }, [allSeasonsSelected, filteredSeasons]);

  if (filteredSeasons.length === 0) return <></>;

  const selectable = !!(onDownloadSeasons || onDownloadEpisodes);
  const totalSeasons = selectedSeasons.size;
  const totalEpisodes = selectedEpisodes.size;
  const hasSelection = totalSeasons > 0 || totalEpisodes > 0;
  const summaryParts: string[] = [];
  if (totalSeasons > 0)
    summaryParts.push(
      `${totalSeasons} season${totalSeasons !== 1 ? "s" : ""}`,
    );
  if (totalEpisodes > 0)
    summaryParts.push(
      `${totalEpisodes} episode${totalEpisodes !== 1 ? "s" : ""}`,
    );

  return (
    <section className={cn("relative", className)}>
      {/* Row 1: Seasons title + Custom Download + Select All */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Seasons</h2>
        <div className="flex items-center gap-3 pr-5">
          {/* Advanced Download */}
          {mediaConfig?.onCustomSearch && (
            <button
              type="button"
              onClick={() => setCustomSearchOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Advanced Download</span>
            </button>
          )}
          {/* Select All checkbox */}
          {selectable && (
            <button
              type="button"
              onClick={selectAllSeasons}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all",
                allSeasonsSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : hasSelection
                    ? "border-primary/50 bg-primary/20"
                    : "border-muted-foreground/30 hover:border-muted-foreground/50",
              )}
              title="Select all"
            >
              {allSeasonsSelected ? (
                <Check size={13} strokeWidth={3} />
              ) : hasSelection ? (
                <Minus size={13} strokeWidth={3} className="text-primary" />
              ) : null}
            </button>
          )}
        </div>
      </div>


      {/* Custom Search Dialog */}
      <Dialog open={customSearchOpen} onOpenChange={setCustomSearchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Custom Torrent Search</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={customSearchQuery}
              onChange={(e) => setCustomSearchQuery(e.target.value)}
              placeholder="e.g. Breaking Bad Season 1 1080p"
              className="h-10"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && customSearchQuery.trim()) {
                  setCustomSearchOpen(false);
                  mediaConfig?.onCustomSearch?.(customSearchQuery.trim());
                  setCustomSearchQuery("");
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCustomSearchOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!customSearchQuery.trim()}
                onClick={() => {
                  setCustomSearchOpen(false);
                  mediaConfig?.onCustomSearch?.(customSearchQuery.trim());
                  setCustomSearchQuery("");
                }}
              >
                <SearchIcon className="mr-1.5 h-4 w-4" />
                Search
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4">
        {filteredSeasons.map((season) => (
          <SeasonBlock
            key={season.id}
            season={season}
            isExpanded={expandedSeasons.has(season.id)}
            isSeasonSelected={selectedSeasons.has(season.seasonNumber)}
            selectedEpisodes={selectedEpisodes}
            selectable={selectable}
            downloadedEpisodes={downloadedEpisodes}
            episodeAvailability={episodeAvailability}
            serverLinks={serverLinks}
            onToggleExpand={() => toggleExpand(season.id)}
            onToggleSeasonSelect={() => toggleSeasonSelect(season)}
            onToggleEpisode={toggleEpisode}
            onDownload={onDownloadSeasons ? () => onDownloadSeasons([season.seasonNumber]) : undefined}
          />
        ))}
      </div>

      {/* Floating search torrent bar */}
      {hasSelection && !hideFloatingBar && (onDownloadSeasons || onDownloadEpisodes) && (
        <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center md:bottom-6">
          <div className="flex items-center gap-4 rounded-full border border-border/50 bg-foreground px-2.5 py-2 text-background shadow-2xl">
            <button
              type="button"
              onClick={clearAll}
              className="flex h-7 w-7 items-center justify-center rounded-full text-background/40 transition-colors hover:bg-background/10 hover:text-background"
            >
              <X size={14} />
            </button>
            <span className="text-sm font-medium">
              {summaryParts.join(" + ")}
            </span>
            <Button
              size="sm"
              className="gap-1.5 rounded-full px-5"
              onClick={() => {
                if (onDownloadSeasons && totalSeasons > 0) {
                  onDownloadSeasons(
                    [...selectedSeasons].sort((a, b) => a - b),
                  );
                }
                if (onDownloadEpisodes && totalEpisodes > 0) {
                  for (const s of filteredSeasons) {
                    const eps = (s.episodes ?? []).filter((e) =>
                      selectedEpisodes.has(e.id),
                    );
                    if (eps.length > 0) {
                      onDownloadEpisodes(
                        s.seasonNumber,
                        eps.map((e) => e.episodeNumber),
                      );
                    }
                  }
                }
                // Reset selections after triggering download
                setSelectedSeasons(new Set());
                setSelectedEpisodes(new Set());
              }}
            >
              <Search size={14} />
              Search torrent
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─── Season Block ─── */

function SeasonBlock({
  season,
  isExpanded,
  isSeasonSelected,
  selectedEpisodes,
  selectable,
  downloadedEpisodes,
  episodeAvailability,
  serverLinks,
  onToggleExpand,
  onToggleSeasonSelect,
  onToggleEpisode,
  onDownload,
}: {
  season: Season;
  isExpanded: boolean;
  isSeasonSelected: boolean;
  selectedEpisodes: Set<string>;
  selectable: boolean;
  downloadedEpisodes?: Map<string, EpisodeDownloadInfo>;
  episodeAvailability?: Record<string, Array<{ type: string; resolution?: string | null }>>;
  serverLinks?: { jellyfin?: { url: string }; plex?: { url: string } };
  onToggleExpand: () => void;
  onToggleSeasonSelect: () => void;
  onToggleEpisode: (id: string) => void;
  onDownload?: () => void;
}): React.JSX.Element {
  const episodes = useMemo(
    () =>
      (season.episodes ?? []).sort(
        (a, b) => a.episodeNumber - b.episodeNumber,
      ),
    [season.episodes],
  );

  const selectedCount = episodes.filter((e) =>
    selectedEpisodes.has(e.id),
  ).length;
  const allEpsSelected =
    episodes.length > 0 &&
    episodes.every((e) => selectedEpisodes.has(e.id));

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
  const _availableEpCount = Math.max(jellyfinEpCount, plexEpCount);

  const isSpecials = season.seasonNumber === 0;
  const sNum = String(season.seasonNumber).padStart(2, "0");
  const epCount = episodes.length || season.episodeCount || 0;
  const year = season.airDate
    ? new Date(season.airDate).getFullYear()
    : null;
  const rawTitle = season.name || `Season ${season.seasonNumber}`;
  // Strip redundant season prefix (e.g. "S1 • Kazakage Rescue" → "Kazakage Rescue")
  const seasonTitle = isSpecials
    ? "Specials"
    : rawTitle.replace(
        /^(?:s(?:eason)?\s*0*\d+)\s*[•·\-–—:|]\s*/i,
        "",
      ) || rawTitle;

  return (
    <div className="rounded-xl bg-card p-1">
      {/* Header — clickable to expand, with download + checkbox on right */}
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
                <span className="mx-1.5 text-muted-foreground/20 sm:mx-2">|</span>
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
          {onDownload && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDownload(); }}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:text-foreground"
              title={`Download ${seasonTitle}`}
            >
              <Download size={24} />
            </button>
          )}
          {selectable && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSeasonSelect(); }}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all",
                isSeasonSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : allEpsSelected
                    ? "border-primary bg-primary/80 text-primary-foreground"
                    : selectedCount > 0
                      ? "border-primary/50 bg-primary/20"
                      : "border-muted-foreground/30 hover:border-muted-foreground/50",
              )}
            >
              {isSeasonSelected || allEpsSelected ? (
                <Check size={13} strokeWidth={3} />
              ) : selectedCount > 0 ? (
                <Minus size={13} strokeWidth={3} className="text-primary" />
              ) : null}
            </button>
          )}
        </div>
      </div>

      {/* Collapsible episodes */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {/* Episode list */}
        {episodes.length > 0 && (
          <div className="flex flex-col divide-y divide-border/30 pb-2">
            {episodes.map((ep) => (
              <EpisodeCard
                key={ep.id}
                episode={ep}
                seasonNumber={season.seasonNumber}
                isSelected={
                  selectedEpisodes.has(ep.id) || isSeasonSelected
                }
                isMuted={isSeasonSelected}
                onToggle={() =>
                  !isSeasonSelected && onToggleEpisode(ep.id)
                }
                selectable={selectable && !isSeasonSelected}
                downloadInfo={downloadedEpisodes?.get(ep.id)}
                serverAvailability={episodeAvailability?.[
                  `S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
                ]}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
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

