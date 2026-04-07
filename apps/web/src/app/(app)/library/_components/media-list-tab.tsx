"use client";

import { useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "~/components/layout/state-message";
import { MediaGrid } from "~/components/media/media-grid";
import type { FilterOutput } from "~/components/media/filter-sidebar";

const PAGE_SIZE = 20;

export function MediaListTab({
  slug,
  preset,
  showFilters,
  filters,
}: {
  slug: string;
  preset: "emptyWatchlist" | "emptyServerLibrary";
  showFilters: boolean;
  filters: FilterOutput;
}): React.JSX.Element {
  const router = useRouter();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.list.getBySlug.useInfiniteQuery(
      {
        slug,
        limit: PAGE_SIZE,
        genreIds: filters.genreIds,
        genreMode: filters.genreMode,
        language: filters.language,
        scoreMin: filters.scoreMin,
        yearMin: filters.yearMin,
        yearMax: filters.yearMax,
        runtimeMin: filters.runtimeMin,
        runtimeMax: filters.runtimeMax,
        certification: filters.certification,
        status: filters.status,
        sortBy: filters.sortBy,
        watchProviders: filters.watchProviders,
        watchRegion: filters.watchRegion,
      },
      {
        getNextPageParam: (lastPage, _allPages, lastPageParam) => {
          const currentOffset = (lastPageParam as number) ?? 0;
          const nextOffset = currentOffset + PAGE_SIZE;
          if (nextOffset >= lastPage.total) return undefined;
          return nextOffset;
        },
        initialCursor: 0,
      },
    );

  const items = useMemo(
    () =>
      data?.pages.flatMap((page) =>
        page.items.map((item) => ({
          id: item.media.id,
          externalId: String(item.media.externalId),
          provider: item.media.provider,
          type: item.media.type as "movie" | "show",
          title: item.media.title,
          posterPath: item.media.posterPath,
          year: item.media.year ?? undefined,
          voteAverage: item.media.voteAverage ?? undefined,
        })),
      ) ?? [],
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
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleFetchNextPage]);

  if (isError) {
    return <StateMessage preset="error" onRetry={() => void refetch()} />;
  }

  if (!isLoading && items.length === 0) {
    return (
      <StateMessage
        preset={preset}
        action={{ label: "Discover Media", onClick: () => router.push("/") }}
      />
    );
  }

  return (
    <>
      <MediaGrid items={items} isLoading={isLoading} compact={showFilters} />

      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hasNextPage && !isFetchingNextPage && items.length > 0 && !isLoading && (
        <StateMessage preset="endOfItems" inline />
      )}
    </>
  );
}
