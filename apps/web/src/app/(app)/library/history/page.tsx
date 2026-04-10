"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Film, Loader2, Tv } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar, type TabItem } from "~/components/layout/tab-bar";
import { StateMessage } from "~/components/layout/state-message";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { trpc } from "~/lib/trpc/client";
import {
  LibraryPlaybackCard,
  type LibraryPlaybackEntry,
} from "../_components/library-playback-card";

const TYPE_TABS: TabItem[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies", icon: Film },
  { value: "show", label: "TV Shows", icon: Tv },
];

const SOURCE_FILTERS = [
  { value: "all", label: "All" },
  { value: "jellyfin", label: "Jellyfin" },
  { value: "plex", label: "Plex" },
  { value: "manual", label: "Manual" },
] as const;

const PAGE_SIZE = 40;

export default function HistoryPage(): React.JSX.Element {
  useDocumentTitle("Watch History");

  const [mediaType, setMediaType] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const queryMediaType = mediaType === "all" ? undefined : (mediaType as "movie" | "show");

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.userMedia.getLibraryHistory.useInfiniteQuery(
    { limit: PAGE_SIZE, mediaType: queryMediaType },
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

  const filteredEntries = useMemo(() => {
    if (sourceFilter === "all") return entries;
    return entries.filter((entry) => {
      const entrySource = entry.source ?? "manual";
      return entrySource === sourceFilter;
    });
  }, [entries, sourceFilter]);

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

  return (
    <div className="w-full pb-12">
      <PageHeader title="Watch History" subtitle="A timeline of everything you've watched." />
      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar tabs={TYPE_TABS} value={mediaType} onChange={setMediaType} />

        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {SOURCE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setSourceFilter(filter.value)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                sourceFilter === filter.value
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-[120px] animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : isError ? (
          <StateMessage preset="error" onRetry={() => void refetch()} />
        ) : filteredEntries.length === 0 ? (
          <StateMessage
            title="Stellar silence"
            description="Your watch history will build up here as you journey through movies and shows."
          />
        ) : (
          <>
            <div className="space-y-2.5">
              {filteredEntries.map((entry) => (
                <LibraryPlaybackCard key={entry.id} entry={entry} mode="history" />
              ))}
            </div>

            <div ref={sentinelRef} className="h-1" />

            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
