"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, History, Loader2, Tv } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { mediaHref } from "~/lib/media-href";

const PAGE_SIZE = 40;

interface HistoryEntry {
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

function formatHistoryDate(value: Date): string {
  if (Number.isNaN(value.getTime())) return "Unknown date";
  return value.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function posterUrl(path: string): string {
  return path.startsWith("http")
    ? path
    : `https://image.tmdb.org/t/p/w185${path}`;
}

function formatProgress(seconds: number): string {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function HistoryTab(): React.JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.userMedia.getLibraryHistory.useInfiniteQuery(
    { limit: PAGE_SIZE },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const entries = useMemo(
    () => (data?.pages.flatMap((page) => page.items) ?? []) as HistoryEntry[],
    [data],
  );

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) handleFetchNextPage();
      },
      { rootMargin: "220px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleFetchNextPage]);

  if (isLoading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-[108px] animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Failed to load your watch history.
        </p>
        <button
          type="button"
          className="mt-2 text-sm font-medium text-foreground/80 hover:text-foreground"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        No watch history yet. Mark items as watched or sync Plex/Jellyfin to
        build your timeline.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2.5">
        {entries.map((entry) => {
          const isInProgress =
            entry.entryType === "playback" && entry.isCompleted === false;
          const progressText =
            entry.progressUnit === "seconds" &&
            entry.progressValue !== null &&
            entry.progressTotal !== null
              ? `${formatProgress(entry.progressValue)} / ${formatProgress(entry.progressTotal)}`
              : entry.progressUnit === "episodes" &&
                  entry.progressValue !== null &&
                  entry.progressTotal !== null
                ? `${entry.progressValue}/${entry.progressTotal} episodes watched`
                : entry.mediaType === "movie" && entry.isCompleted
                  ? "Completed"
                : null;
          const episodeLabel = entry.episode
            ? entry.episode.seasonNumber !== null && entry.episode.number !== null
              ? `${isInProgress ? "In progress" : "Watched"} S${String(entry.episode.seasonNumber).padStart(2, "0")}E${String(entry.episode.number).padStart(2, "0")}${entry.episode.title ? ` · ${entry.episode.title}` : ""}`
              : `${isInProgress ? "In progress" : "Watched"} episode${entry.episode.title ? ` · ${entry.episode.title}` : ""}`
            : `${isInProgress ? "In progress movie" : "Watched movie"}`;

          return (
            <Link
              key={entry.id}
              href={mediaHref(entry.provider, entry.externalId, entry.mediaType)}
              className="group flex min-h-[108px] items-center gap-4 rounded-2xl border border-border/50 bg-muted/20 px-4 py-3 transition-colors hover:bg-accent/50"
            >
              <div className="relative h-[90px] w-[58px] shrink-0 overflow-hidden rounded-lg bg-background/70">
                {entry.posterPath ? (
                  <Image
                    src={posterUrl(entry.posterPath)}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="58px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    {entry.mediaType === "show" ? (
                      <Tv className="h-4 w-4" />
                    ) : (
                      <Bookmark className="h-4 w-4" />
                    )}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-foreground">
                  {entry.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {episodeLabel}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/90">
                  {formatHistoryDate(new Date(entry.watchedAt))} ·{" "}
                  {sourceLabel(entry.source)}
                </p>
                {entry.progressPercent !== null && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-background/80">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400"
                        style={{ width: `${entry.progressPercent}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {progressText ?? `${entry.progressPercent}% complete`}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/70 text-muted-foreground transition-colors group-hover:text-foreground">
                <History className="h-4 w-4" />
              </div>
            </Link>
          );
        })}
      </div>

      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </>
  );
}
