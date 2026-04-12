"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaCard, MediaCardSkeleton } from "~/components/media/media-card";
import { StateMessage } from "~/components/layout/state-message";

const GRID_CLASSES =
  "grid gap-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6";

export function RatingsTab(): React.JSX.Element {
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.userMedia.getUserMedia.useInfiniteQuery(
    { hasRating: true, sortBy: "rating", sortOrder: "desc", limit: 24 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const items = useMemo(
    () =>
      data?.pages.flatMap((page) =>
        page.items.map((item) => ({
          id: item.mediaId,
          externalId: String(item.externalId),
          provider: item.provider,
          type: item.mediaType as "movie" | "show",
          title: item.title,
          posterPath: item.posterPath,
          year: item.year,
          rating: item.rating,
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

  if (isLoading) {
    return (
      <div className={GRID_CLASSES}>
        {Array.from({ length: 12 }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <StateMessage preset="emptyRatings" />;
  }

  return (
    <>
      <div className={GRID_CLASSES}>
        {items.map((item) => (
          <div key={item.id} className="relative">
            <MediaCard
              id={item.id}
              externalId={item.externalId}
              provider={item.provider}
              type={item.type}
              title={item.title}
              posterPath={item.posterPath}
              year={item.year}
              showTypeBadge
              showRating={false}
              showYear={false}
              showTitle={false}
            />
            <div className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-xs font-bold text-yellow-400">
              {item.rating}
            </div>
          </div>
        ))}
      </div>

      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hasNextPage && !isFetchingNextPage && items.length > 0 && (
        <StateMessage preset="endOfItems" inline />
      )}
    </>
  );
}
