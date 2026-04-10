"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Film, Loader2, Tv } from "lucide-react";
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

const PAGE_SIZE = 40;

export default function WatchedPage(): React.JSX.Element {
  useDocumentTitle("Watched");

  const [mediaType, setMediaType] = useState("all");
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

  return (
    <div className="w-full pb-12">
      <PageHeader title="Watched" subtitle="Everything you've finished watching." />
      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <TabBar tabs={TYPE_TABS} value={mediaType} onChange={setMediaType} />

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
        ) : watchedItems.length === 0 ? (
          <StateMessage
            title="Uncharted territory"
            description="Your watched titles will appear here as you explore the cosmos of entertainment."
          />
        ) : (
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
        )}
      </div>
    </div>
  );
}
