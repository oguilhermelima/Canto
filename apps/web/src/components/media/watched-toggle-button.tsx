"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  CheckCheck,
  ChevronDown,
  Clock3,
  Film,
  HelpCircle,
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
  DialogHeader,
  DialogTitle,
} from "@canto/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@canto/ui/popover";
import { trpc } from "~/lib/trpc/client";
import { toast } from "sonner";
import { TabBar } from "~/components/layout/tab-bar";

type TrackingStatus = "none" | "planned" | "watching" | "completed" | "dropped";
type WatchScope = "movie" | "show" | "season" | "episode";
type ModalTab = "track" | "history";
type TrackingStep = "what" | "when";
type WatchedAtMode = "just_now" | "release_date" | "other_date" | "unknown_date";
type BulkSelectionMode = "all" | "select";

interface WatchEpisode {
  id: string;
  seasonNumber: number;
  number: number;
  title?: string | null;
  airDate?: string | null;
}

interface WatchSeason {
  number: number;
  episodes: WatchEpisode[];
}

interface UserMediaStatePayload {
  mediaId: string;
  trackingStatus: TrackingStatus;
  rating: number | null;
  progress: number;
  isCompleted: boolean;
  lastWatchedAt: Date | null;
  source: string | null;
}

interface WatchHistoryEntry {
  id: string;
  episodeId: string | null;
  watchedAt: Date | string;
  source: string | null;
}

interface HistoryGroupItem {
  entry: WatchHistoryEntry;
  label: string;
}

interface HistoryGroup {
  key: string;
  title: string;
  items: HistoryGroupItem[];
}

interface WatchTrackingButtonProps {
  mediaId: string;
  mediaType: "movie" | "show";
  title: string;
  trackingStatus?: TrackingStatus;
  seasons?: WatchSeason[];
  className?: string;
}

interface MultiSelectOption {
  value: string;
  label: string;
}

const controlClassName =
  "h-10 w-full appearance-none rounded-xl border-0 bg-accent px-3 pr-9 text-sm text-foreground/80 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary/30";

const smallControlClassName =
  "h-9 w-full appearance-none rounded-xl border-0 bg-accent px-3 text-sm text-foreground/80 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary/30";

const MODAL_TABS: Array<{ value: ModalTab; label: string; icon: typeof CheckCircle2 }> = [
  { value: "track", label: "Track", icon: CheckCircle2 },
  { value: "history", label: "History", icon: History },
];

const STEP_TABS: Array<{ value: TrackingStep; label: string }> = [
  { value: "what", label: "1. What" },
  { value: "when", label: "2. When" },
];

const DATE_MODE_OPTIONS: Array<{
  value: WatchedAtMode;
  label: string;
  description: string;
  icon: typeof Clock3;
}> = [
  {
    value: "just_now",
    label: "Just now",
    description: "Use current date and time",
    icon: Clock3,
  },
  {
    value: "release_date",
    label: "Release date",
    description: "Use official release date",
    icon: CalendarDays,
  },
  {
    value: "other_date",
    label: "Choose date",
    description: "Pick an exact date and time",
    icon: CalendarRange,
  },
  {
    value: "unknown_date",
    label: "Unknown date",
    description: "Save without a known watch date",
    icon: HelpCircle,
  },
];

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toDatetimeLocalString(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function normalizeStatus(status: TrackingStatus): TrackingStatus {
  return status === "planned" ? "none" : status;
}

function statusLabel(status: TrackingStatus): string {
  const normalized = normalizeStatus(status);
  switch (normalized) {
    case "watching":
      return "Partially Watched";
    case "completed":
      return "Watched";
    case "dropped":
      return "Dropped";
    default:
      return "Mark as Watched";
  }
}

function statusButtonClass(status: TrackingStatus): string {
  const normalized = normalizeStatus(status);
  switch (normalized) {
    case "completed":
      return "bg-emerald-600 text-white hover:bg-emerald-500";
    case "watching":
      return "bg-gradient-to-r from-emerald-500 via-emerald-500 to-emerald-400 text-emerald-950 hover:opacity-95 dark:text-emerald-50";
    case "dropped":
      return "bg-red-500/20 text-red-200 hover:bg-red-500/30";
    default:
      return "bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85";
  }
}

function statusIcon(status: TrackingStatus): React.JSX.Element {
  const normalized = normalizeStatus(status);
  if (normalized === "watching") {
    return <Check className="h-4 w-4" />;
  }
  return <CheckCheck className="h-4 w-4" />;
}

function isReleasedEpisode(airDate: string | null | undefined): boolean {
  if (!airDate) return true;
  const parsed = new Date(airDate);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() <= Date.now();
}

function episodeLabel(episode: WatchEpisode): string {
  const season = String(episode.seasonNumber).padStart(2, "0");
  const number = String(episode.number).padStart(2, "0");
  return `S${season}E${number}${episode.title ? ` · ${episode.title}` : ""}`;
}

function formatHistoryDate(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sourceLabel(source: string | null): string {
  if (!source) return "Manual";
  if (source === "release") return "Release date";
  if (source === "unknown") return "Unknown date";
  return source[0]?.toUpperCase() + source.slice(1);
}

function formatLocalDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Select date and time";
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildDatetimeFromParts(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): string {
  const maxDay = daysInMonth(parts.year, parts.month);
  const safeDay = Math.min(parts.day, maxDay);
  const next = new Date(
    parts.year,
    parts.month - 1,
    safeDay,
    parts.hour,
    parts.minute,
    0,
    0,
  );
  return toDatetimeLocalString(next);
}

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
            "flex min-h-[40px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl bg-accent px-3 py-2 text-left text-sm transition-colors hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
            value.length === 0 && "text-muted-foreground",
          )}
        >
          {value.length === 0 ? (
            <span className="truncate">{placeholder ?? "Select..."}</span>
          ) : (
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {value.map((selectedValue) => {
                const label =
                  options.find((option) => option.value === selectedValue)?.label ??
                  selectedValue;
                return (
                  <span
                    key={selectedValue}
                    className="inline-flex max-w-full items-center gap-1 rounded-lg bg-background px-2 py-1 text-sm font-medium text-foreground"
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
                      className="cursor-pointer rounded-sm transition-colors hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </span>
                );
              })}
            </div>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] rounded-xl border-border/60 bg-background p-0"
        onWheel={(event) => event.stopPropagation()}
      >
        <div
          className="max-h-[280px] overflow-y-auto p-1.5"
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
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition-colors",
                  selected
                    ? "bg-primary/5 text-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground",
                  )}
                >
                  {selected && <Check className="h-2.5 w-2.5" />}
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

  const years = Array.from({ length: 83 }).map((_, index) => now.getFullYear() - 80 + index);

  const update = (parts: Partial<{
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  }>): void => {
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
          className="flex h-10 w-full items-center justify-between rounded-xl bg-accent px-3 text-sm text-foreground/80 transition-colors hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
        >
          <span>{formatLocalDateTime(value)}</span>
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[340px] rounded-xl border border-border/60 bg-background p-3"
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
                onChange={(event) => update({ month: Number(event.target.value) })}
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
                onChange={(event) => update({ year: Number(event.target.value) })}
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
                onChange={(event) => update({ hour: Number(event.target.value) })}
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
                onChange={(event) => update({ minute: Number(event.target.value) })}
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
  trackingStatus = "none",
  seasons = [],
  className,
}: WatchTrackingButtonProps): React.JSX.Element {
  const utils = trpc.useUtils();
  const isMovie = mediaType === "movie";
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>("track");
  const [step, setStep] = useState<TrackingStep>(isMovie ? "when" : "what");
  const [scope, setScope] = useState<WatchScope>(
    mediaType === "movie" ? "movie" : "episode",
  );
  const [seasonNumber, setSeasonNumber] = useState<number | undefined>(undefined);
  const [dateMode, setDateMode] = useState<WatchedAtMode>("just_now");
  const [customWatchedAt, setCustomWatchedAt] = useState(
    toDatetimeLocalString(new Date()),
  );
  const [bulkMode, setBulkMode] = useState<BulkSelectionMode>("all");
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);
  const [selectedHistoryEntryIds, setSelectedHistoryEntryIds] = useState<string[]>(
    [],
  );

  const orderedSeasons = useMemo(
    () =>
      [...seasons]
        .map((season) => ({
          ...season,
          episodes: [...season.episodes].sort((a, b) => a.number - b.number),
        }))
        .sort((a, b) => a.number - b.number),
    [seasons],
  );

  const releasedSeasons = useMemo(
    () =>
      orderedSeasons
        .map((season) => ({
          ...season,
          episodes: season.episodes.filter((episode) =>
            isReleasedEpisode(episode.airDate),
          ),
        }))
        .filter((season) => season.episodes.length > 0),
    [orderedSeasons],
  );

  const allEpisodes = useMemo(
    () => orderedSeasons.flatMap((season) => season.episodes),
    [orderedSeasons],
  );
  const allReleasedEpisodes = useMemo(
    () => releasedSeasons.flatMap((season) => season.episodes),
    [releasedSeasons],
  );

  const episodeById = useMemo(
    () =>
      new Map(
        allEpisodes.map((episode) => [episode.id, episode] as const),
      ),
    [allEpisodes],
  );

  const currentSeasonEpisodes =
    releasedSeasons.find((season) => season.number === seasonNumber)?.episodes ??
    [];

  const scopedEpisodes = useMemo(() => {
    if (mediaType !== "show") return [];
    if (scope === "show") return allReleasedEpisodes;
    if (scope === "season") return currentSeasonEpisodes;
    if (selectedEpisodeIds.length === 0) return [];
    const selectedSet = new Set(selectedEpisodeIds);
    return currentSeasonEpisodes.filter((episode) => selectedSet.has(episode.id));
  }, [
    mediaType,
    scope,
    allReleasedEpisodes,
    currentSeasonEpisodes,
    selectedEpisodeIds,
  ]);

  const historyQuery = trpc.userMedia.getHistory.useQuery(
    { mediaId },
    { enabled: open && activeTab === "history" },
  );

  useEffect(() => {
    if (!open) return;
    setActiveTab("track");
    setStep(isMovie ? "when" : "what");
    setDateMode("just_now");
    setCustomWatchedAt(toDatetimeLocalString(new Date()));
    setBulkMode("all");
    setSelectedHistoryEntryIds([]);

    if (mediaType === "movie") {
      setScope("movie");
      setSeasonNumber(undefined);
      setSelectedEpisodeIds([]);
      return;
    }

    const latestSeason = releasedSeasons[releasedSeasons.length - 1];
    const latestEpisode = latestSeason?.episodes[latestSeason.episodes.length - 1];
    setScope("episode");
    setSeasonNumber(latestSeason?.number);
    setSelectedEpisodeIds(latestEpisode ? [latestEpisode.id] : []);
  }, [open, mediaType, releasedSeasons, isMovie]);

  useEffect(() => {
    if (!open || mediaType !== "show" || scope !== "episode") return;

    const selectedSeason = seasonNumber !== undefined
      ? releasedSeasons.find((season) => season.number === seasonNumber)
      : undefined;
    const fallbackSeason = selectedSeason ?? releasedSeasons[releasedSeasons.length - 1];
    if (!fallbackSeason) {
      setSeasonNumber(undefined);
      setSelectedEpisodeIds([]);
      return;
    }

    if (seasonNumber !== fallbackSeason.number) {
      setSeasonNumber(fallbackSeason.number);
    }

    const seasonEpisodeIds = new Set(fallbackSeason.episodes.map((episode) => episode.id));
    const validSelected = selectedEpisodeIds.filter((id) => seasonEpisodeIds.has(id));

    if (validSelected.length !== selectedEpisodeIds.length) {
      setSelectedEpisodeIds(validSelected);
    }
  }, [open, mediaType, scope, seasonNumber, releasedSeasons, selectedEpisodeIds]);

  useEffect(() => {
    if (!open || mediaType !== "show") return;
    if (scope === "show" || scope === "season") {
      setSelectedEpisodeIds(scopedEpisodes.map((episode) => episode.id));
      setBulkMode("all");
    }
  }, [open, mediaType, scope, scopedEpisodes]);

  useEffect(() => {
    if (activeTab !== "history") {
      setSelectedHistoryEntryIds([]);
    }
  }, [activeTab]);

  const applyState = (state: UserMediaStatePayload): void => {
    utils.userMedia.getState.setData({ mediaId }, state);
    void utils.userMedia.getState.invalidate({ mediaId });
  };

  const trackMutation = trpc.userMedia.logWatched.useMutation({
    onSuccess: (result) => {
      applyState(result.state as UserMediaStatePayload);
      setOpen(false);
      setBulkMode("all");
      void utils.userMedia.getHistory.invalidate({ mediaId });
      toast.success(
        result.trackedItems > 0
          ? `Tracking updated (${result.trackedItems} item${result.trackedItems === 1 ? "" : "s"})`
          : "Tracking updated",
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const removeHistoryMutation = trpc.userMedia.removeHistoryEntries.useMutation({
    onSuccess: (result) => {
      applyState(result.state as UserMediaStatePayload);
      setSelectedHistoryEntryIds([]);
      void utils.userMedia.getHistory.invalidate({ mediaId });
      toast.success(
        result.removedItems > 0
          ? `Removed ${result.removedItems} history item${result.removedItems === 1 ? "" : "s"}`
          : "No history items removed",
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const markDroppedMutation = trpc.userMedia.markDropped.useMutation({
    onSuccess: (result) => {
      applyState(result.state as UserMediaStatePayload);
      setOpen(false);
      toast.success("Marked as dropped");
    },
    onError: (error) => toast.error(error.message),
  });

  const clearTrackingMutation = trpc.userMedia.clearTracking.useMutation({
    onSuccess: (result) => {
      applyState(result.state as UserMediaStatePayload);
      setOpen(false);
      toast.success("Tracking status cleared");
    },
    onError: (error) => toast.error(error.message),
  });

  const pending =
    trackMutation.isPending ||
    removeHistoryMutation.isPending ||
    markDroppedMutation.isPending ||
    clearTrackingMutation.isPending;

  const isDateValid =
    dateMode !== "other_date" ||
    !Number.isNaN(new Date(customWatchedAt).getTime());

  const canContinueWhat =
    mediaType === "movie" ||
    (scope === "show" && allReleasedEpisodes.length > 0) ||
    (scope === "season" &&
      seasonNumber !== undefined &&
      currentSeasonEpisodes.length > 0) ||
    (scope === "episode" &&
      seasonNumber !== undefined &&
      selectedEpisodeIds.length > 0 &&
      scopedEpisodes.length > 0);

  const requiresBulkChoice =
    mediaType === "show" &&
    (scope === "show" || scope === "season") &&
    scopedEpisodes.length > 1;

  const selectedScopeSummary = useMemo(() => {
    if (mediaType === "movie") return "Movie";
    if (scope === "show") {
      return `${scopedEpisodes.length} released episode${scopedEpisodes.length === 1 ? "" : "s"}`;
    }
    if (scope === "season") {
      return `Season ${seasonNumber ?? "?"} · ${scopedEpisodes.length} episode${scopedEpisodes.length === 1 ? "" : "s"}`;
    }
    if (scopedEpisodes.length === 1) {
      const onlyEpisode = scopedEpisodes[0];
      return onlyEpisode ? episodeLabel(onlyEpisode) : "Episode";
    }
    return `${scopedEpisodes.length} episodes selected`;
  }, [mediaType, scope, seasonNumber, scopedEpisodes]);

  const episodeOptions = useMemo(
    () =>
      currentSeasonEpisodes.map((episode) => ({
        value: episode.id,
        label: episodeLabel(episode),
      })),
    [currentSeasonEpisodes],
  );

  const submitTracking = (useSelectedEpisodes: boolean): void => {
    const payload: {
      mediaId: string;
      watchedAtMode: WatchedAtMode;
      watchedAt?: string;
      scope?: WatchScope;
      seasonNumber?: number;
      selectedEpisodeIds?: string[];
    } = {
      mediaId,
      watchedAtMode: dateMode,
    };

    if (dateMode === "other_date") {
      const parsed = new Date(customWatchedAt);
      if (Number.isNaN(parsed.getTime())) {
        toast.error("Invalid watch date");
        return;
      }
      payload.watchedAt = parsed.toISOString();
    }

    if (mediaType === "movie") {
      payload.scope = "movie";
    } else if (scope === "episode") {
      if (selectedEpisodeIds.length === 0) {
        toast.error("Select at least one episode");
        return;
      }
      payload.selectedEpisodeIds = selectedEpisodeIds;
    } else if (useSelectedEpisodes) {
      if (selectedEpisodeIds.length === 0) {
        toast.error("Select at least one episode");
        return;
      }
      payload.selectedEpisodeIds = selectedEpisodeIds;
    } else if (scope === "show") {
      payload.scope = "show";
    } else if (scope === "season") {
      payload.scope = "season";
      payload.seasonNumber = seasonNumber;
    } else {
      payload.scope = "show";
    }

    trackMutation.mutate(payload);
  };

  const handlePrimaryAction = (): void => {
    if (step === "what") {
      if (!canContinueWhat || pending) return;
      setStep("when");
      return;
    }

    const useSelectedEpisodes = requiresBulkChoice && bulkMode === "select";
    if (!isDateValid) return;
    if (useSelectedEpisodes && selectedEpisodeIds.length === 0) return;
    submitTracking(useSelectedEpisodes);
  };

  const handleStepChange = (value: string): void => {
    if (isMovie) return;
    if (value !== "what" && value !== "when") return;
    if (value === "when" && !canContinueWhat) return;
    setStep(value);
  };

  const toggleEpisode = (episodeId: string): void => {
    setSelectedEpisodeIds((current) =>
      current.includes(episodeId)
        ? current.filter((id) => id !== episodeId)
        : [...current, episodeId],
    );
  };

  const toggleHistoryEntry = (entryId: string): void => {
    setSelectedHistoryEntryIds((current) =>
      current.includes(entryId)
        ? current.filter((id) => id !== entryId)
        : [...current, entryId],
    );
  };

  const removeSelectedHistory = (): void => {
    if (selectedHistoryEntryIds.length === 0) return;
    removeHistoryMutation.mutate({
      mediaId,
      entryIds: selectedHistoryEntryIds,
    });
  };

  const normalizedStatus = normalizeStatus(trackingStatus);
  const historyEntries = (historyQuery.data ?? []) as WatchHistoryEntry[];
  const historyGroups = useMemo<HistoryGroup[]>(() => {
    if (historyEntries.length === 0) return [];

    const groups = new Map<string, HistoryGroup>();

    for (const entry of historyEntries) {
      if (mediaType === "movie") {
        const key = "movie";
        const existing = groups.get(key) ?? { key, title: "Movie", items: [] };
        existing.items.push({ entry, label: "Movie" });
        groups.set(key, existing);
        continue;
      }

      if (!entry.episodeId) {
        const key = "other";
        const existing = groups.get(key) ?? { key, title: "Other", items: [] };
        existing.items.push({ entry, label: "Episode" });
        groups.set(key, existing);
        continue;
      }

      const episode = episodeById.get(entry.episodeId);
      if (!episode) {
        const key = "other";
        const existing = groups.get(key) ?? { key, title: "Other", items: [] };
        existing.items.push({ entry, label: "Episode" });
        groups.set(key, existing);
        continue;
      }

      const key = `season-${episode.seasonNumber}`;
      const existing = groups.get(key) ?? {
        key,
        title: `Season ${episode.seasonNumber}`,
        items: [],
      };
      existing.items.push({ entry, label: episodeLabel(episode) });
      groups.set(key, existing);
    }

    return [...groups.values()];
  }, [historyEntries, mediaType, episodeById]);

  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex h-11 min-w-[190px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
          statusButtonClass(normalizedStatus),
          className,
        )}
        onClick={() => setOpen(true)}
      >
        {statusIcon(normalizedStatus)}
        <span>{statusLabel(normalizedStatus)}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-border bg-background p-0 md:h-[56vh] md:max-h-[56vh] md:max-w-3xl md:rounded-[2rem] [&>button:last-child]:hidden">
          <DialogHeader bar className="border-border/50">
            <TabBar
              tabs={MODAL_TABS}
              value={activeTab}
              onChange={(value) => setActiveTab(value as ModalTab)}
              className="mb-2 py-0"
            />
            <DialogTitle>
              {activeTab === "track" ? "Track watch history" : "Watch history"}
            </DialogTitle>
            <DialogDescription>
              {activeTab === "track"
                ? `Mark what you watched for ${title}.`
                : `Review watched entries for ${title}.`}
            </DialogDescription>
          </DialogHeader>

          {activeTab === "track" ? (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-3 md:px-6 md:py-4">
                {!isMovie && (
                  <TabBar
                    tabs={STEP_TABS}
                    value={step}
                    onChange={handleStepChange}
                    className="mb-4 py-0"
                  />
                )}

                {step === "what" ? (
                  <div className="space-y-4">
                    {mediaType === "movie" ? (
                      <div className="flex items-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium">
                        <Film className="h-4 w-4 text-muted-foreground" />
                        Movie
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            What did you watch?
                          </label>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {[
                              {
                                value: "show",
                                title: "Entire show",
                                description: "All released episodes",
                                icon: Tv,
                              },
                              {
                                value: "season",
                                title: "One season",
                                description: "A released season",
                                icon: Film,
                              },
                              {
                                value: "episode",
                                title: "One episode",
                                description: "Defaults to latest released",
                                icon: CheckCircle2,
                              },
                            ].map((option) => {
                              const Icon = option.icon;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => {
                                    const nextScope = option.value as WatchScope;
                                    setScope(nextScope);
                                    if (nextScope === "episode") {
                                      const latestSeason = releasedSeasons[releasedSeasons.length - 1];
                                      const latestEpisode =
                                        latestSeason?.episodes[latestSeason.episodes.length - 1];
                                      setSeasonNumber(latestSeason?.number);
                                      setSelectedEpisodeIds(latestEpisode ? [latestEpisode.id] : []);
                                    }
                                  }}
                                  className={cn(
                                    "rounded-xl border border-transparent bg-accent px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
                                    scope === option.value
                                      ? "border-primary/30 bg-primary/10"
                                      : "hover:bg-accent/80",
                                  )}
                                >
                                  <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                    {option.title}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {option.description}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {(scope === "season" || scope === "episode") && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
                                    const latestEpisode =
                                      releasedSeasons
                                        .find((season) => season.number === nextSeasonNumber)
                                        ?.episodes.slice(-1)[0];
                                    setSelectedEpisodeIds(latestEpisode ? [latestEpisode.id] : []);
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
                            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                              Episodes
                            </label>
                            <ChipMultiSelect
                              value={selectedEpisodeIds}
                              onChange={setSelectedEpisodeIds}
                              options={episodeOptions}
                              placeholder="Select one or more episodes"
                            />
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                          Only released episodes are shown here.
                        </p>

                        {releasedSeasons.length === 0 && (
                          <div className="rounded-xl bg-accent px-3 py-2.5 text-sm text-muted-foreground">
                            There are no released episodes available yet.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-accent px-3 py-2.5">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Selected scope
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        {selectedScopeSummary}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        When did you watch this?
                      </label>
                      <div className="space-y-2">
                        {DATE_MODE_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const selected = dateMode === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setDateMode(option.value)}
                              className={cn(
                                "w-full rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
                                selected
                                  ? "border-primary/30 bg-primary/10"
                                  : "border-transparent bg-accent hover:bg-accent/80",
                              )}
                            >
                              <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                {option.label}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {option.description}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {dateMode === "other_date" && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Exact date and time
                        </label>
                        <DateTimeValuePicker
                          value={customWatchedAt}
                          onChange={setCustomWatchedAt}
                        />
                      </div>
                    )}

                    {requiresBulkChoice && (
                      <div className="space-y-3 rounded-2xl border border-border/50 bg-muted/20 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">
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
                              "rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
                              bulkMode === "all"
                                ? "bg-background text-foreground shadow-sm"
                                : "bg-accent text-muted-foreground hover:text-foreground",
                            )}
                          >
                            Mark all episodes
                          </button>
                          <button
                            type="button"
                            onClick={() => setBulkMode("select")}
                            className={cn(
                              "rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
                              bulkMode === "select"
                                ? "bg-background text-foreground shadow-sm"
                                : "bg-accent text-muted-foreground hover:text-foreground",
                            )}
                          >
                            Select individually
                          </button>
                        </div>

                        {bulkMode === "select" && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                {selectedEpisodeIds.length} of {scopedEpisodes.length} selected
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-xl bg-accent px-2 py-1 hover:text-foreground"
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
                                  className="rounded-xl bg-accent px-2 py-1 hover:text-foreground"
                                  onClick={() => setSelectedEpisodeIds([])}
                                >
                                  Clear
                                </button>
                              </div>
                            </div>

                            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                              {scopedEpisodes.map((episode) => {
                                const selected = selectedEpisodeIds.includes(episode.id);
                                return (
                                  <button
                                    key={episode.id}
                                    type="button"
                                    onClick={() => toggleEpisode(episode.id)}
                                    className={cn(
                                      "flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30",
                                      selected
                                        ? "border-primary/30 bg-primary/10"
                                        : "border-transparent bg-accent hover:bg-accent/80",
                                    )}
                                  >
                                    <span className="truncate pr-2 text-sm">
                                      {episodeLabel(episode)}
                                    </span>
                                    <span
                                      className={cn(
                                        "inline-flex shrink-0 items-center rounded-xl px-2.5 py-1 text-xs font-medium",
                                        selected
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-background text-muted-foreground",
                                      )}
                                    >
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
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border/50 px-5 py-3 md:px-6">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    {normalizedStatus === "watching" && (
                      <Button
                        variant="ghost"
                        className="rounded-xl text-red-300 hover:text-red-200"
                        disabled={pending}
                        onClick={() => markDroppedMutation.mutate({ mediaId })}
                      >
                        Mark as dropped
                      </Button>
                    )}
                    {normalizedStatus === "dropped" && (
                      <Button
                        variant="ghost"
                        className="rounded-xl"
                        disabled={pending}
                        onClick={() => clearTrackingMutation.mutate({ mediaId })}
                      >
                        Clear dropped status
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {step === "when" && !isMovie && (
                      <Button
                        variant="ghost"
                        className="rounded-xl"
                        onClick={() => setStep("what")}
                        disabled={pending}
                      >
                        Back
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="rounded-xl"
                      onClick={() => setOpen(false)}
                      disabled={pending}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="rounded-xl"
                      onClick={handlePrimaryAction}
                      disabled={
                        pending ||
                        (step === "what" && !canContinueWhat) ||
                        (step === "when" &&
                          (!isDateValid ||
                            (requiresBulkChoice &&
                              bulkMode === "select" &&
                              selectedEpisodeIds.length === 0)))
                      }
                    >
                      {pending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : step === "what" ? (
                        "Next: when"
                      ) : requiresBulkChoice && bulkMode === "select" ? (
                        "Mark selected as watched"
                      ) : requiresBulkChoice ? (
                        "Mark all as watched"
                      ) : (
                        "Mark as watched"
                      )}
                    </Button>
                  </div>
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
                          className="group overflow-hidden rounded-xl border border-border/50 bg-muted/20"
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
                            <span className="text-sm font-medium">{group.title}</span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{group.items.length}</span>
                              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                            </div>
                          </summary>
                          <div className="border-t border-border/40">
                            {group.items.map((item) => {
                              const selected = selectedHistoryEntryIds.includes(
                                item.entry.id,
                              );
                              return (
                                <button
                                  key={item.entry.id}
                                  type="button"
                                  onClick={() => toggleHistoryEntry(item.entry.id)}
                                  className={cn(
                                    "flex w-full items-start gap-3 border-b border-border/30 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/70",
                                    selected && "bg-primary/10",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                                      selected
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-muted-foreground/60",
                                    )}
                                  >
                                    {selected && <Check className="h-3 w-3" />}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                      {item.label}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {formatHistoryDate(item.entry.watchedAt)} ·{" "}
                                      {sourceLabel(item.entry.source)}
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

              <div className="shrink-0 border-t border-border/50 px-5 py-3 md:px-6">
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
