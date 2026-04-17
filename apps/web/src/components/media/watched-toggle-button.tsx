"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Ban,
  CalendarRange,
  Check,
  CheckCircle2,
  CheckCheck,
  ChevronDown,
  Film,
  History,
  Loader2,
  Tv,
  X,
} from "lucide-react";
import { Button } from "@canto/ui/button";
import { cn } from "@canto/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@canto/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@canto/ui/popover";
import type {
  MultiSelectOption,
  WatchScope,
  WatchTrackingButtonProps,
} from "./watched-toggle/types";
import {
  DATE_MODE_OPTIONS,
  MONTH_NAMES,
  buildDatetimeFromParts,
  controlClassName,
  daysInMonth,
  episodeLabel,
  formatHistoryDate,
  formatLocalDateTime,
  smallControlClassName,
  sourceLabel,
  statusButtonClass,
  statusIcon,
  statusLabel,
  toDatetimeLocalString,
} from "./watched-toggle/utils";
import { useWatchedToggle } from "./watched-toggle/use-watched-toggle";

function ChipMultiSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const toggle = (optionValue: string): void => {
    onChange(
      value.includes(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-h-[36px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-accent px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/20",
            value.length === 0 && "text-muted-foreground",
          )}
        >
          {value.length === 0 ? (
            <span className="truncate">{placeholder ?? "Select..."}</span>
          ) : (
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {value.map((selectedValue) => {
                const label =
                  options.find((option) => option.value === selectedValue)
                    ?.label ?? selectedValue;
                return (
                  <span
                    key={selectedValue}
                    className="inline-flex max-w-full items-center gap-1 rounded-md bg-foreground/10 px-1.5 py-0.5 text-xs font-medium text-foreground"
                  >
                    <span className="truncate">{label}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(selectedValue);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.stopPropagation();
                          toggle(selectedValue);
                        }
                      }}
                      className="cursor-pointer rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </span>
                );
              })}
            </div>
          )}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] rounded-xl border-border bg-background p-1"
        onWheel={(event) => event.stopPropagation()}
      >
        <div
          className="max-h-[240px] overflow-y-auto"
          onWheel={(event) => {
            event.stopPropagation();
            event.currentTarget.scrollTop += event.deltaY;
          }}
        >
          {options.map((option) => {
            const selected = value.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors",
                  selected
                    ? "bg-foreground/5 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <div
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-muted-foreground",
                  )}
                >
                  {selected && <Check className="h-2 w-2" />}
                </div>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DateTimeValuePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  const now = new Date();
  const parsed = new Date(value);
  const resolved = Number.isNaN(parsed.getTime()) ? now : parsed;

  const year = resolved.getFullYear();
  const month = resolved.getMonth() + 1;
  const day = resolved.getDate();
  const hour = resolved.getHours();
  const minute = resolved.getMinutes();
  const maxDay = daysInMonth(year, month);

  const years = Array.from({ length: 83 }).map(
    (_, index) => now.getFullYear() - 80 + index,
  );

  const update = (
    parts: Partial<{
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
    }>,
  ): void => {
    onChange(
      buildDatetimeFromParts({
        year: parts.year ?? year,
        month: parts.month ?? month,
        day: parts.day ?? day,
        hour: parts.hour ?? hour,
        minute: parts.minute ?? minute,
      }),
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-xl bg-accent px-3 text-sm text-foreground transition-colors hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
        >
          <span>{formatLocalDateTime(value)}</span>
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[340px] rounded-xl border border-border bg-background p-3"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Day
              </label>
              <select
                className={smallControlClassName}
                value={day}
                onChange={(event) => update({ day: Number(event.target.value) })}
              >
                {Array.from({ length: maxDay }).map((_, index) => {
                  const optionDay = index + 1;
                  return (
                    <option key={optionDay} value={optionDay}>
                      {optionDay}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Month
              </label>
              <select
                className={smallControlClassName}
                value={month}
                onChange={(event) =>
                  update({ month: Number(event.target.value) })
                }
              >
                {MONTH_NAMES.map((monthName, index) => {
                  const optionMonth = index + 1;
                  return (
                    <option key={monthName} value={optionMonth}>
                      {monthName}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Year
              </label>
              <select
                className={smallControlClassName}
                value={year}
                onChange={(event) =>
                  update({ year: Number(event.target.value) })
                }
              >
                {years.map((optionYear) => (
                  <option key={optionYear} value={optionYear}>
                    {optionYear}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Hour
              </label>
              <select
                className={smallControlClassName}
                value={hour}
                onChange={(event) =>
                  update({ hour: Number(event.target.value) })
                }
              >
                {Array.from({ length: 24 }).map((_, index) => (
                  <option key={index} value={index}>
                    {String(index).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Minute
              </label>
              <select
                className={smallControlClassName}
                value={minute}
                onChange={(event) =>
                  update({ minute: Number(event.target.value) })
                }
              >
                {Array.from({ length: 60 }).map((_, index) => (
                  <option key={index} value={index}>
                    {String(index).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-xl bg-accent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => onChange(toDatetimeLocalString(new Date()))}
            >
              Use current time
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function WatchTrackingButton({
  mediaId,
  mediaType,
  title,
  backdropPath,
  trackingStatus = "none",
  seasons = [],
  className,
}: WatchTrackingButtonProps): React.JSX.Element {
  const isMovie = mediaType === "movie";
  const toggle = useWatchedToggle({
    mediaId,
    mediaType,
    seasons,
    trackingStatus,
  });
  const {
    open,
    setOpen,
    activeTab,
    setActiveTab,
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
    selectedHistoryEntryIds,
    releasedSeasons,
    currentSeasonEpisodes,
    scopedEpisodes,
    episodeOptions,
    historyQuery,
    historyGroups,
    normalizedStatus,
    pending,
    isDateValid,
    canContinueWhat,
    requiresBulkChoice,
    toggleEpisode,
    toggleHistoryEntry,
    removeSelectedHistory,
    submitTracking,
    markDropped,
    clearTracking,
  } = toggle;

  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex h-11 min-w-[190px] items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold backdrop-blur-md transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
          statusButtonClass(normalizedStatus),
          className,
        )}
        onClick={() => setOpen(true)}
      >
        {statusIcon(normalizedStatus)}
        <span>{statusLabel(normalizedStatus)}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-3xl [&>button:last-child]:hidden">
          {/* ── Cinematic header with backdrop ── */}
          <div className="relative shrink-0 overflow-hidden">
            {backdropPath && (
              <>
                <Image
                  src={
                    backdropPath.startsWith("http")
                      ? backdropPath
                      : `https://image.tmdb.org/t/p/w780${backdropPath}`
                  }
                  alt=""
                  fill
                  className="object-cover object-center"
                  sizes="600px"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
              </>
            )}
            <div
              className={cn(
                "relative px-5 pb-5 md:px-6",
                backdropPath ? "pt-14" : "pt-5",
              )}
            >
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-xl font-bold">
                    {activeTab === "track" ? "I watched..." : "Watch history"}
                  </DialogTitle>
                  <DialogDescription className="mt-1 truncate text-sm text-foreground">
                    {title}
                  </DialogDescription>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActiveTab(activeTab === "track" ? "history" : "track")
                  }
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {activeTab === "track" ? (
                    <>
                      <History className="h-3.5 w-3.5" /> History
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Track
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {activeTab === "track" ? (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-4 md:px-6">
                <div className="space-y-5">
                  {/* ── What did you watch? ── */}
                  {!isMovie && (
                    <section className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        What
                      </p>

                      {/* Scope as compact pills */}
                      <div className="flex gap-2">
                        {[
                          { value: "show", label: "Entire show", icon: Tv },
                          { value: "season", label: "Season", icon: Film },
                          {
                            value: "episode",
                            label: "Episode",
                            icon: CheckCircle2,
                          },
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
                                const nextSeasonNumber = Number(
                                  event.target.value,
                                );
                                setSeasonNumber(nextSeasonNumber);
                                if (scope === "episode") {
                                  const latestEpisode = releasedSeasons
                                    .find(
                                      (season) =>
                                        season.number === nextSeasonNumber,
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

                  {/* ── When ── */}
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
                                {selectedEpisodeIds.length} of{" "}
                                {scopedEpisodes.length} selected
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg px-2 py-1 transition-colors hover:text-foreground"
                                  onClick={() =>
                                    setSelectedEpisodeIds(
                                      scopedEpisodes.map(
                                        (episode) => episode.id,
                                      ),
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
                                      {selected && (
                                        <Check className="mr-1 h-3 w-3" />
                                      )}
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
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-4 md:px-6 md:py-4">
                <div className="space-y-3">
                  {historyQuery.isLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div
                          key={index}
                          className="h-16 animate-pulse rounded-xl bg-accent"
                        />
                      ))}
                    </div>
                  ) : historyGroups.length === 0 ? (
                    <div className="rounded-xl bg-accent px-3 py-4 text-sm text-muted-foreground">
                      No watch history yet for this title.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {historyGroups.map((group) => (
                        <details
                          key={group.key}
                          className="group overflow-hidden rounded-xl border border-border bg-muted/20"
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
                            <span className="text-sm font-medium">
                              {group.title}
                            </span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{group.items.length}</span>
                              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                            </div>
                          </summary>
                          <div className="border-t border-border">
                            {group.items.map((item) => {
                              const selected = selectedHistoryEntryIds.includes(
                                item.entry.id,
                              );
                              return (
                                <button
                                  key={item.entry.id}
                                  type="button"
                                  onClick={() =>
                                    toggleHistoryEntry(item.entry.id)
                                  }
                                  className={cn(
                                    "flex w-full items-start gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/70",
                                    selected && "bg-primary/10",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                                      selected
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-muted-foreground",
                                    )}
                                  >
                                    {selected && <Check className="h-3 w-3" />}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                      {item.label}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {formatHistoryDate(item.entry.watchedAt)}{" "}
                                      · {sourceLabel(item.entry.source)}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 border-t border-border px-5 py-3 md:px-6">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="rounded-xl"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                  >
                    Close
                  </Button>
                  <Button
                    variant="destructive"
                    className="rounded-xl"
                    onClick={removeSelectedHistory}
                    disabled={pending || selectedHistoryEntryIds.length === 0}
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      `Remove from watch history${selectedHistoryEntryIds.length > 0 ? ` (${selectedHistoryEntryIds.length})` : ""}`
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
