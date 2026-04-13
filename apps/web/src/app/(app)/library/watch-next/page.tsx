"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Film, Loader2, Tv } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import type { TabItem } from "~/components/layout/tab-bar";
import { StateMessage } from "~/components/layout/state-message";
import { FilterSidebar } from "~/components/media/filter-sidebar";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { trpc } from "~/lib/trpc/client";
import {
  LibraryPlaybackCard,
} from "../_components/library-playback-card";
import type { LibraryPlaybackEntry } from "../_components/library-playback-card";

const TYPE_TABS: TabItem[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies", icon: Film },
  { value: "show", label: "TV Shows", icon: Tv },
];

const PAGE_SIZE = 40;

export default function WatchNextPage(): React.JSX.Element {
  useDocumentTitle("Watch Next");

  const [mediaType, setMediaType] = useState("all");
  const [showFilters, setShowFilters] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const queryMediaType =
    mediaType === "all" ? undefined : (mediaType as "movie" | "show");

  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.userMedia.getLibraryWatchNext.useInfiniteQuery(
      { limit: PAGE_SIZE, view: "watch_next", mediaType: queryMediaType },
      { getNextPageParam: (lp) => lp.nextCursor, initialCursor: 0 },
    );

  const items = useMemo(
    () =>
      (data?.pages.flatMap((p) => p.items) ?? []).map(
        (item): LibraryPlaybackEntry => ({
          id: item.id,
          entryType: "playback",
          mediaId: item.mediaId,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
          year: item.year,
          externalId: item.externalId,
          provider: item.provider,
          watchedAt: item.watchedAt ?? new Date(),
          source: item.source,
          episode: item.episode,
          progressPercent: item.progressPercent,
          progressValue: item.progressValue,
          progressTotal: item.progressTotal,
          progressUnit: item.progressUnit,
          isCompleted: false,
        }),
      ),
    [data],
  );

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
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

  return (
    <div className="w-full pb-12">
      <PageHeader
        title="Watch Next"
        subtitle="Your next episodes are ready."
      />
      <div className="flex px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <div
          className={cn(
            "hidden w-[20rem] shrink-0 transition-[margin,opacity] duration-300 ease-in-out md:block",
            showFilters ? "mr-4 opacity-100 lg:mr-8" : "-ml-[20rem] mr-0 opacity-0",
          )}
        >
          <FilterSidebar
            mediaType={mediaType as "all" | "movie" | "show"}
            onFilterChange={() => {}}
          />
        </div>

        <div className="min-w-0 flex-1">
          <TabBar
            tabs={TYPE_TABS}
            value={mediaType}
            onChange={setMediaType}
            onFilter={() => setShowFilters(!showFilters)}
            filterActive={showFilters}
          />

          {isLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[120px] animate-pulse rounded-2xl bg-muted"
                />
              ))}
            </div>
          ) : isError ? (
            <StateMessage preset="error" onRetry={() => void refetch()} />
          ) : items.length === 0 ? (
            <StateMessage preset="emptyWatchNext" />
          ) : (
            <>
              <div className="space-y-2.5">
                {items.map((entry) => (
                  <LibraryPlaybackCard
                    key={entry.id}
                    entry={entry}
                    mode="watched"
                  />
                ))}
              </div>

              <div ref={sentinelRef} className="h-1" />

              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!hasNextPage && !isFetchingNextPage && items.length > 0 && (
                <StateMessage preset="endOfItems" inline />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
