"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bookmark, Loader2, PlayCircle, Sparkles, Tv } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { mediaHref } from "~/lib/media-href";

const PAGE_SIZE = 24;

type WatchNextView = "continue" | "watch_next";

interface WatchNextItem {
  id: string;
  kind: "continue" | "next_episode" | "next_movie";
  mediaId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  year: number | null;
  externalId: number;
  provider: string;
  source: string;
  progressSeconds: number;
  durationSeconds: number | null;
  progressPercent: number | null;
  progressValue: number | null;
  progressTotal: number | null;
  progressUnit: "seconds" | "episodes" | null;
  watchedAt: Date | null;
  episode:
    | {
        id: string;
        seasonNumber: number | null;
        number: number | null;
        title: string | null;
      }
    | null;
  fromLists: string[];
}

function sourceLabel(source: string): string {
  if (source === "jellyfin") return "Jellyfin";
  if (source === "plex") return "Plex";
  return "Library";
}

function formatProgress(seconds: number): string {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function posterUrl(path: string): string {
  return path.startsWith("http")
    ? path
    : `https://image.tmdb.org/t/p/w185${path}`;
}

export function WatchNextTab({
  view = "watch_next",
}: {
  view?: WatchNextView;
}): React.JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.userMedia.getLibraryWatchNext.useInfiniteQuery(
    { limit: PAGE_SIZE, view },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const items = useMemo(
    () => (data?.pages.flatMap((page) => page.items) ?? []) as WatchNextItem[],
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
            className="h-[132px] animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Failed to load your watch next feed.
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

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        {view === "continue"
          ? "No active playback yet. Start watching on Plex/Jellyfin and your continue queue will appear here."
          : "Your watch next queue is empty. Add titles to Watchlist/Collections or sync Plex/Jellyfin progress to populate this tab."}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2.5">
        {items.map((item) => {
          const progressText =
            item.progressUnit === "seconds" &&
            item.progressTotal !== null &&
            item.progressValue !== null
              ? `${formatProgress(item.progressValue)} / ${formatProgress(item.progressTotal)}`
              : item.progressUnit === "episodes" &&
                  item.progressTotal !== null &&
                  item.progressValue !== null
                ? `${item.progressValue}/${item.progressTotal} episodes watched`
                : null;

          return (
            <Link
              key={item.id}
              href={mediaHref(item.provider, item.externalId, item.mediaType)}
              className="group flex min-h-[132px] items-start gap-4 rounded-2xl border border-border/50 bg-muted/20 p-3.5 transition-colors hover:bg-accent/50"
            >
              <div className="relative h-[116px] w-[78px] shrink-0 overflow-hidden rounded-lg bg-background/70">
                {item.posterPath ? (
                  <Image
                    src={posterUrl(item.posterPath)}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="78px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    {item.mediaType === "show" ? (
                      <Tv className="h-4 w-4" />
                    ) : (
                      <Bookmark className="h-4 w-4" />
                    )}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-base font-semibold text-foreground">
                  {item.title}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.kind === "continue"
                    ? `${item.episode ? `S${String(item.episode.seasonNumber ?? 0).padStart(2, "0")}E${String(item.episode.number ?? 0).padStart(2, "0")}` : "Movie"} · ${sourceLabel(item.source)}`
                    : item.kind === "next_episode"
                      ? `Next episode · S${String(item.episode?.seasonNumber ?? 0).padStart(2, "0")}E${String(item.episode?.number ?? 0).padStart(2, "0")}${item.episode?.title ? ` · ${item.episode.title}` : ""}`
                      : "Start this movie next"}
                </p>
                {item.fromLists.length > 0 && (
                  <p className="mt-1 truncate text-xs text-muted-foreground/90">
                    From: {item.fromLists.join(" · ")}
                  </p>
                )}

                {item.progressPercent !== null && (
                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-background/80">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400"
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {progressText ?? `${item.progressPercent}% complete`}
                    </p>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    {view === "continue" ? "Continue" : "Watch next"}
                  </span>
                  <span className="inline-flex items-center gap-1 transition-colors group-hover:text-foreground">
                    <PlayCircle className="h-3.5 w-3.5" />
                    Open
                  </span>
                </div>
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
