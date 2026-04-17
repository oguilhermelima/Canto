import {
  Ban,
  CalendarDays,
  CalendarRange,
  CheckCheck,
  CircleDot,
  Clock3,
  Eye,
  HelpCircle,
} from "lucide-react";
import type { TrackingStatus, WatchedAtMode, WatchEpisode } from "./types";

export const controlClassName =
  "h-10 w-full appearance-none rounded-xl border-0 bg-accent px-3 pr-9 text-sm text-foreground outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary/30";

export const smallControlClassName =
  "h-9 w-full appearance-none rounded-xl border-0 bg-accent px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary/30";

export const DATE_MODE_OPTIONS: Array<{
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

export const MONTH_NAMES = [
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

export function toDatetimeLocalString(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function normalizeStatus(status: TrackingStatus): TrackingStatus {
  return status === "planned" ? "none" : status;
}

export function statusLabel(status: TrackingStatus): string {
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

export function statusButtonClass(status: TrackingStatus): string {
  const normalized = normalizeStatus(status);
  switch (normalized) {
    case "completed":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25";
    case "watching":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20";
    case "dropped":
      return "border-zinc-500/30 bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20";
    default:
      return "border-foreground/20 bg-foreground/15 text-foreground hover:bg-foreground/25";
  }
}

export function statusIcon(status: TrackingStatus): React.JSX.Element {
  const normalized = normalizeStatus(status);
  switch (normalized) {
    case "watching":
      return <CircleDot className="h-4 w-4" />;
    case "completed":
      return <CheckCheck className="h-4 w-4" />;
    case "dropped":
      return <Ban className="h-4 w-4" />;
    default:
      return <Eye className="h-4 w-4" />;
  }
}

export function isReleasedEpisode(airDate: string | null | undefined): boolean {
  if (!airDate) return true;
  const parsed = new Date(airDate);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() <= Date.now();
}

export function episodeLabel(episode: WatchEpisode): string {
  const season = String(episode.seasonNumber).padStart(2, "0");
  const number = String(episode.number).padStart(2, "0");
  return `S${season}E${number}${episode.title ? ` · ${episode.title}` : ""}`;
}

export function formatHistoryDate(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function sourceLabel(source: string | null): string {
  if (!source) return "Manual";
  if (source === "release") return "Release date";
  if (source === "unknown") return "Unknown date";
  return source[0]?.toUpperCase() + source.slice(1);
}

export function formatLocalDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Select date and time";
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function buildDatetimeFromParts(parts: {
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
