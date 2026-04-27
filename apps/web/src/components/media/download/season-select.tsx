"use client";

import { useState, useCallback, useMemo } from "react";
import { cn } from "@canto/ui/cn";
import {
  Check,
  Minus,
  ChevronRight,
} from "lucide-react";
import { FadeImage } from "@/components/ui/fade-image";

interface Episode {
  id: string;
  number: number;
  title: string | null;
  overview?: string | null;
  stillPath?: string | null;
  airDate?: string | null;
  runtime?: number | null;
}

interface Season {
  id: string;
  number: number;
  name: string | null;
  episodeCount?: number | null;
  airDate?: string | null;
  episodes: Episode[];
}

interface SeasonSelectProps {
  seasons: Season[];
  selectedSeasons: Set<number>;
  setSelectedSeasons: React.Dispatch<React.SetStateAction<Set<number>>>;
  selectedEpisodes: Set<string>;
  setSelectedEpisodes: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function SeasonSelect({
  seasons,
  selectedSeasons,
  setSelectedSeasons,
  selectedEpisodes,
  setSelectedEpisodes,
}: SeasonSelectProps): React.JSX.Element {
  const filteredSeasons = useMemo(
    () =>
      [...seasons]
        .filter((s) => s.episodes.length > 0)
        .sort((a, b) => a.number - b.number),
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

  const toggleSeasonSelect = useCallback(
    (season: Season) => {
      const sn = season.number;
      const wasSelected = selectedSeasons.has(sn);
      setSelectedSeasons((prev) => {
        const next = new Set(prev);
        if (wasSelected) next.delete(sn);
        else next.add(sn);
        return next;
      });
      if (!wasSelected) {
        setSelectedEpisodes((prev) => {
          const next = new Set(prev);
          for (const ep of season.episodes) next.delete(ep.id);
          return next;
        });
      }
    },
    [selectedSeasons, setSelectedSeasons, setSelectedEpisodes],
  );

  const toggleEpisode = useCallback(
    (episodeId: string) => {
      setSelectedEpisodes((prev) => {
        const next = new Set(prev);
        if (next.has(episodeId)) next.delete(episodeId);
        else next.add(episodeId);
        return next;
      });
    },
    [setSelectedEpisodes],
  );

  const allSeasonsSelected =
    filteredSeasons.length > 0 &&
    filteredSeasons.every((s) => selectedSeasons.has(s.number));
  const hasSelection = selectedSeasons.size > 0 || selectedEpisodes.size > 0;

  const selectAllSeasons = useCallback(() => {
    if (allSeasonsSelected) {
      setSelectedSeasons(new Set());
    } else {
      setSelectedSeasons(
        new Set(filteredSeasons.map((s) => s.number)),
      );
      setSelectedEpisodes(new Set());
    }
  }, [
    allSeasonsSelected,
    filteredSeasons,
    setSelectedSeasons,
    setSelectedEpisodes,
  ]);

  return (
    <div>
      {/* Season list with select-all aligned to season checkboxes */}
      <div className="flex flex-col gap-1.5">
        {/* Select all — matches season block structure: outer p-1 + inner px-3 */}
        <div className="rounded-xl bg-card p-1">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-medium text-muted-foreground">
                Select all
              </span>
            </div>
            <button
              type="button"
              onClick={selectAllSeasons}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                allSeasonsSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : hasSelection
                    ? "border-primary bg-primary/20"
                    : "border-muted-foreground hover:border-muted-foreground",
              )}
              title="Select all"
            >
              {allSeasonsSelected ? (
                <Check size={11} strokeWidth={3} />
              ) : hasSelection ? (
                <Minus size={11} strokeWidth={3} className="text-primary" />
              ) : null}
            </button>
          </div>
        </div>
        {filteredSeasons.map((season) => (
          <SeasonBlock
            key={season.id}
            season={season}
            isExpanded={expandedSeasons.has(season.id)}
            isSeasonSelected={selectedSeasons.has(season.number)}
            selectedEpisodes={selectedEpisodes}
            onToggleExpand={() => toggleExpand(season.id)}
            onToggleSeasonSelect={() => toggleSeasonSelect(season)}
            onToggleEpisode={toggleEpisode}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Season Block ─── */

function SeasonBlock({
  season,
  isExpanded,
  isSeasonSelected,
  selectedEpisodes,
  onToggleExpand,
  onToggleSeasonSelect,
  onToggleEpisode,
}: {
  season: Season;
  isExpanded: boolean;
  isSeasonSelected: boolean;
  selectedEpisodes: Set<string>;
  onToggleExpand: () => void;
  onToggleSeasonSelect: () => void;
  onToggleEpisode: (id: string) => void;
}): React.JSX.Element {
  const episodes = useMemo(
    () =>
      [...season.episodes].sort(
        (a, b) => a.number - b.number,
      ),
    [season.episodes],
  );

  const selectedCount = episodes.filter((e) =>
    selectedEpisodes.has(e.id),
  ).length;
  const allEpsSelected =
    episodes.length > 0 &&
    episodes.every((e) => selectedEpisodes.has(e.id));

  const isSpecials = season.number === 0;
  const sNum = String(season.number).padStart(2, "0");
  const epCount = episodes.length || season.episodeCount || 0;
  const year = season.airDate
    ? new Date(season.airDate).getFullYear()
    : null;
  const rawTitle = season.name || `Season ${season.number}`;
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
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
      >
        <ChevronRight
          size={16}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-tight">
            {isSpecials ? (
              <span>{seasonTitle}</span>
            ) : (
              <>
                <span>S{sNum}</span>
                <span className="mx-1.5 text-muted-foreground/60">|</span>
                <span>{seasonTitle}</span>
              </>
            )}
          </h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{epCount} episodes</span>
            {year && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <span>{year}</span>
              </>
            )}
          </div>
        </div>
        <div
          className="flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSeasonSelect();
            }}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
              isSeasonSelected
                ? "border-primary bg-primary text-primary-foreground"
                : allEpsSelected
                  ? "border-primary bg-primary/80 text-primary-foreground"
                  : selectedCount > 0
                    ? "border-primary bg-primary/20"
                    : "border-muted-foreground hover:border-muted-foreground",
            )}
          >
            {isSeasonSelected || allEpsSelected ? (
              <Check size={11} strokeWidth={3} />
            ) : selectedCount > 0 ? (
              <Minus size={11} strokeWidth={3} className="text-primary" />
            ) : null}
          </button>
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
          <div className="flex flex-col divide-y divide-border/30 pb-2">
            {episodes.map((ep) => {
              const isFuture =
                !!ep.airDate && new Date(ep.airDate) > new Date();
              const isSelected =
                selectedEpisodes.has(ep.id) || isSeasonSelected;
              const isMuted = isSeasonSelected;
              const isInteractive = !isFuture && !isSeasonSelected;
              const num = String(ep.number).padStart(2, "0");

              return (
                <div
                  key={ep.id}
                  role={isInteractive ? "button" : undefined}
                  tabIndex={isInteractive ? 0 : undefined}
                  onClick={isInteractive ? () => onToggleEpisode(ep.id) : undefined}
                  onKeyDown={isInteractive ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleEpisode(ep.id);
                    }
                  } : undefined}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2 transition-colors",
                    isFuture && "pointer-events-none opacity-40",
                    isInteractive && "cursor-pointer hover:bg-muted/40",
                    !isFuture && isMuted && "opacity-40",
                  )}
                >
                  {/* Thumbnail */}
                  <div className="relative hidden h-12 w-20 shrink-0 overflow-hidden rounded-md bg-muted sm:block">
                    {ep.stillPath ? (
                      <FadeImage
                        src={
                          ep.stillPath.startsWith("http")
                            ? ep.stillPath
                            : `https://image.tmdb.org/t/p/w400${ep.stillPath}`
                        }
                        alt={ep.title || `Episode ${ep.number}`}
                        fill
                        className="object-cover"
                        fadeDuration={300}
                        sizes="112px"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                        <span className="text-sm font-black text-muted-foreground">
                          E{num}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-medium">E{num}</span>
                      {ep.airDate && (
                        <>
                          <span className="text-muted-foreground/60">·</span>
                          <span>
                            {new Date(ep.airDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs font-semibold leading-snug">
                      {ep.title || `Episode ${ep.number}`}
                    </p>
                  </div>

                  {/* Checkbox */}
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all",
                      isSelected && !isMuted
                        ? "border-primary bg-primary text-primary-foreground"
                        : isMuted
                          ? "border-muted-foreground"
                          : "border-muted-foreground group-hover:border-muted-foreground",
                    )}
                  >
                    {isSelected && !isMuted && (
                      <Check size={11} strokeWidth={3} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {episodes.length === 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-10 text-xs text-muted-foreground">
              No episodes available
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
