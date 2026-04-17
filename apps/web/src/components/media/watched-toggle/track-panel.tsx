"use client";

import {
  Ban,
  Check,
  CheckCircle2,
  CheckCheck,
  ChevronDown,
  Film,
  Loader2,
  Tv,
} from "lucide-react";
import { cn } from "@canto/ui/cn";
import { ChipMultiSelect } from "./chip-multi-select";
import { DateTimeValuePicker } from "./date-time-picker";
import type { WatchScope } from "./types";
import type { UseWatchedToggleResult } from "./use-watched-toggle";
import {
  DATE_MODE_OPTIONS,
  controlClassName,
  episodeLabel,
} from "./utils";

interface TrackPanelProps {
  isMovie: boolean;
  toggle: UseWatchedToggleResult;
}

export function TrackPanel({
  isMovie,
  toggle,
}: TrackPanelProps): React.JSX.Element {
  const {
    scope,
    setScope,
    seasonNumber,
    setSeasonNumber,
    dateMode,
    setDateMode,
    customWatchedAt,
    setCustomWatchedAt,
    bulkMode,
    setBulkMode,
    selectedEpisodeIds,
    setSelectedEpisodeIds,
    releasedSeasons,
    scopedEpisodes,
    episodeOptions,
    normalizedStatus,
    pending,
    isDateValid,
    canContinueWhat,
    requiresBulkChoice,
    toggleEpisode,
    submitTracking,
    markDropped,
    clearTracking,
    setOpen,
  } = toggle;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4 md:px-6">
        <div className="space-y-5">
          {!isMovie && (
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What
              </p>

              <div className="flex gap-2">
                {[
                  { value: "show", label: "Entire show", icon: Tv },
                  { value: "season", label: "Season", icon: Film },
                  { value: "episode", label: "Episode", icon: CheckCircle2 },
                ].map((option) => {
                  const Icon = option.icon;
                  const isSelected = scope === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        const nextScope = option.value as WatchScope;
                        setScope(nextScope);
                        if (nextScope === "episode") {
                          const latestSeason =
                            releasedSeasons[releasedSeasons.length - 1];
                          const latestEpisode =
                            latestSeason?.episodes[
                              latestSeason.episodes.length - 1
                            ];
                          setSeasonNumber(latestSeason?.number);
                          setSelectedEpisodeIds(
                            latestEpisode ? [latestEpisode.id] : [],
                          );
                        }
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200 active:scale-95",
                        isSelected
                          ? "border-foreground bg-foreground/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {(scope === "season" || scope === "episode") && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Season
                  </label>
                  <div className="relative">
                    <select
                      className={controlClassName}
                      value={seasonNumber ?? ""}
                      onChange={(event) => {
                        const nextSeasonNumber = Number(event.target.value);
                        setSeasonNumber(nextSeasonNumber);
                        if (scope === "episode") {
                          const latestEpisode = releasedSeasons
                            .find(
                              (season) => season.number === nextSeasonNumber,
                            )
                            ?.episodes.slice(-1)[0];
                          setSelectedEpisodeIds(
                            latestEpisode ? [latestEpisode.id] : [],
                          );
                        }
                      }}
                    >
                      <option value="" disabled>
                        Select season
                      </option>
                      {releasedSeasons.map((season) => (
                        <option key={season.number} value={season.number}>
                          Season {season.number}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              )}

              {scope === "episode" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Episodes
                  </label>
                  <ChipMultiSelect
                    value={selectedEpisodeIds}
                    onChange={setSelectedEpisodeIds}
                    options={episodeOptions}
                    placeholder="Select one or more episodes"
                  />
                  <p className="text-xs text-muted-foreground">
                    Only released episodes are shown here.
                  </p>
                </div>
              )}

              {releasedSeasons.length === 0 && (
                <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] px-3 py-2.5 text-sm text-muted-foreground">
                  There are no released episodes available yet.
                </div>
              )}
            </section>
          )}

          <section
            className={cn(
              "space-y-3 transition-all duration-300",
              !isMovie &&
                !canContinueWhat &&
                "pointer-events-none opacity-25",
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              When
            </p>

            <div className="flex flex-wrap gap-2">
              {DATE_MODE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = dateMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDateMode(option.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200 active:scale-95",
                      selected
                        ? "border-foreground bg-foreground/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            {dateMode === "other_date" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Exact date and time
                </label>
                <DateTimeValuePicker
                  value={customWatchedAt}
                  onChange={setCustomWatchedAt}
                />
              </div>
            )}

            {requiresBulkChoice && (
              <div className="space-y-3 rounded-2xl border border-border bg-accent p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Episode selection
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {scopedEpisodes.length} available
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setBulkMode("all")}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
                      bulkMode === "all"
                        ? "border-foreground bg-foreground/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                    )}
                  >
                    Mark all episodes
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkMode("select")}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
                      bulkMode === "select"
                        ? "border-foreground bg-foreground/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                    )}
                  >
                    Select individually
                  </button>
                </div>

                {bulkMode === "select" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {selectedEpisodeIds.length} of {scopedEpisodes.length}{" "}
                        selected
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 transition-colors hover:text-foreground"
                          onClick={() =>
                            setSelectedEpisodeIds(
                              scopedEpisodes.map((episode) => episode.id),
                            )
                          }
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 transition-colors hover:text-foreground"
                          onClick={() => setSelectedEpisodeIds([])}
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                      {scopedEpisodes.map((episode) => {
                        const selected = selectedEpisodeIds.includes(
                          episode.id,
                        );
                        return (
                          <button
                            key={episode.id}
                            type="button"
                            onClick={() => toggleEpisode(episode.id)}
                            className={cn(
                              "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-all duration-150 active:scale-[0.99]",
                              selected
                                ? "border-foreground bg-foreground/10"
                                : "border-border hover:border-foreground",
                            )}
                          >
                            <span className="truncate pr-2 text-sm">
                              {episodeLabel(episode)}
                            </span>
                            <span
                              className={cn(
                                "inline-flex shrink-0 items-center rounded-lg px-2 py-0.5 text-xs font-medium transition-colors",
                                selected
                                  ? "bg-foreground/10 text-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              {selected && <Check className="mr-1 h-3 w-3" />}
                              {selected ? "Selected" : "Select"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2 md:px-6">
        <div className="flex items-center gap-2">
          {normalizedStatus === "watching" && (
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:text-foreground disabled:opacity-50"
              disabled={pending}
              onClick={markDropped}
            >
              <Ban className="mr-1 inline h-3 w-3" />
              Drop
            </button>
          )}
          {normalizedStatus === "dropped" && (
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:text-foreground disabled:opacity-50"
              disabled={pending}
              onClick={clearTracking}
            >
              Clear status
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            className="rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:text-foreground disabled:opacity-50"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-all duration-200 hover:scale-[1.03] hover:opacity-90 active:scale-[0.97] disabled:opacity-40"
            onClick={() =>
              submitTracking(requiresBulkChoice && bulkMode === "select")
            }
            disabled={
              pending ||
              !canContinueWhat ||
              !isDateValid ||
              (requiresBulkChoice &&
                bulkMode === "select" &&
                selectedEpisodeIds.length === 0)
            }
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CheckCheck className="h-4 w-4" />
                Save
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
