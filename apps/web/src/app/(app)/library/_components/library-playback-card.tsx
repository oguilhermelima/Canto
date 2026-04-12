"use client";

import Image from "next/image";
import Link from "next/link";
import { Bookmark, CheckCircle2, Clock3, History, Tv } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { mediaHref } from "~/lib/media-href";

export interface LibraryPlaybackEntry {
  id: string;
  entryType: "history" | "playback";
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  watchedAt: Date | string;
  source: string | null;
  episode:
    | {
        id: string | null;
        seasonNumber: number | null;
        number: number | null;
        title: string | null;
      }
    | null;
  progressPercent: number | null;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: "seconds" | "episodes" | null;
  isCompleted: boolean | null;
}

function sourceLabel(source: string | null): string {
  if (source === "jellyfin") return "Jellyfin";
  if (source === "plex") return "Plex";
  if (source === "release") return "Release date";
  if (source === "unknown") return "Unknown date";
  if (source === "manual" || !source) return "Manual";
  return source;
}

function formatWatchedDate(value: Date): string {
  if (Number.isNaN(value.getTime())) return "Unknown date";
  return value.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function posterUrl(path: string): string {
  return path.startsWith("http")
    ? path
    : `https://image.tmdb.org/t/p/w342${path}`;
}

function formatProgress(seconds: number): string {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function episodeLabel(entry: LibraryPlaybackEntry): string {
  const episode = entry.episode;

  if (
    episode &&
    episode.seasonNumber !== null &&
    episode.number !== null
  ) {
    return `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}${episode.title ? ` · ${episode.title}` : ""}`;
  }

  if (episode?.title) {
    return `Episode · ${episode.title}`;
  }

  return entry.mediaType === "show" ? "TV Show" : "Movie";
}

function statusBadge(entry: LibraryPlaybackEntry): {
  label: string;
  className: string;
} {
  const isInProgress = entry.entryType === "playback" && entry.isCompleted === false;
  if (isInProgress) {
    return {
      label: "In progress",
      className: "bg-amber-500/15 text-amber-500",
    };
  }

  if (entry.isCompleted === true || (entry.progressPercent ?? 0) >= 100) {
    return {
      label: "Watched",
      className: "bg-emerald-500/15 text-emerald-500",
    };
  }

  return {
    label: "Logged",
    className: "bg-muted text-muted-foreground",
  };
}

function resolveProgress(entry: LibraryPlaybackEntry): {
  percent: number;
  text: string;
} | null {
  const computedPercent =
    entry.progressValue !== null &&
    entry.progressTotal !== null &&
    entry.progressTotal > 0
      ? (entry.progressValue / entry.progressTotal) * 100
      : null;

  const rawPercent =
    entry.progressPercent ?? computedPercent ?? (entry.isCompleted ? 100 : null);

  if (rawPercent === null) return null;
  const percent = Math.max(0, Math.min(100, Math.round(rawPercent)));

  if (
    entry.progressUnit === "seconds" &&
    entry.progressValue !== null &&
    entry.progressTotal !== null
  ) {
    return {
      percent,
      text: `${formatProgress(entry.progressValue)} / ${formatProgress(entry.progressTotal)}`,
    };
  }

  if (
    entry.progressUnit === "episodes" &&
    entry.progressValue !== null &&
    entry.progressTotal !== null
  ) {
    return {
      percent,
      text: `${entry.progressValue}/${entry.progressTotal} episodes watched`,
    };
  }

  if (percent >= 100) {
    return {
      percent: 100,
      text: entry.mediaType === "movie" ? "Completed" : "Watched",
    };
  }

  return { percent, text: `${percent}% complete` };
}

export function LibraryPlaybackCard({
  entry,
  mode,
}: {
  entry: LibraryPlaybackEntry;
  mode: "watched" | "history";
}): React.JSX.Element {
  const badge = statusBadge(entry);
  const progress = resolveProgress(entry);

  return (
    <Link
      href={mediaHref(entry.provider, entry.externalId, entry.mediaType)}
      className="group block overflow-hidden rounded-2xl border border-border/40 bg-muted/35 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
        <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-background/70 sm:h-24 sm:w-16">
          {entry.posterPath ? (
            <Image
              src={posterUrl(entry.posterPath)}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 640px) 56px, 64px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              {entry.mediaType === "show" ? (
                <Tv className="h-4 w-4" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-foreground sm:text-lg">
              {entry.title}
            </p>
            <span
              className={cn(
                "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                badge.className,
              )}
            >
              {badge.label}
            </span>
          </div>

          <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
            {episodeLabel(entry)}
          </p>

          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
            {formatWatchedDate(new Date(entry.watchedAt))} ·{" "}
            {sourceLabel(entry.source)}
          </p>

          {progress && (
            <div className="mt-3 space-y-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-black/15 dark:bg-white/20">
                <div
                  className="h-full rounded-full bg-black/70 dark:bg-white/70"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">{progress.text}</p>
            </div>
          )}
        </div>

        <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-background/70 text-muted-foreground transition-colors group-hover:text-foreground sm:flex">
          {mode === "watched" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <History className="h-4 w-4" />
          )}
        </div>
      </div>
    </Link>
  );
}
