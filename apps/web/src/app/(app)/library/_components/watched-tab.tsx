"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import {
  LibraryPlaybackCard,
  type LibraryPlaybackEntry,
} from "./library-playback-card";

const PAGE_SIZE = 40;

export function WatchedTab(): React.JSX.Element {
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
    () =>
      (data?.pages.flatMap((page) => page.items) ?? []) as LibraryPlaybackEntry[],
    [data],
  );

  const watchedItems = useMemo(() => {
    return entries.filter(
      (entry) => entry.isCompleted === true || (entry.progressPercent ?? 0) >= 100,
    );
  }, [entries]);

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
            className="h-[120px] animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Failed to load your watched list.
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

  if (watchedItems.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        No watched items yet. Mark something as watched or sync Plex/Jellyfin to
        populate this tab.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2.5">
        {watchedItems.map((entry) => (
          <LibraryPlaybackCard key={entry.id} entry={entry} mode="watched" />
        ))}
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
