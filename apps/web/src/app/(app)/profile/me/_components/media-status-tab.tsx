"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { MediaGrid } from "~/components/media/media-grid";
import { StateMessage } from "~/components/layout/state-message";
import type { SPACE_STATES } from "~/components/layout/state-message";

const EMPTY_PRESET_MAP: Record<
  "planned" | "completed" | "dropped",
  keyof typeof SPACE_STATES
> = {
  planned: "emptyWatchlist",
  completed: "emptyCompleted",
  dropped: "emptyDropped",
};

interface MediaStatusTabProps {
  status: "planned" | "completed" | "dropped";
}

export function MediaStatusTab({ status }: MediaStatusTabProps): React.JSX.Element {
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
    { status, limit: 24 },
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
    return <MediaGrid items={[]} isLoading />;
  }

  if (items.length === 0) {
    return <StateMessage preset={EMPTY_PRESET_MAP[status]} />;
  }

  return (
    <>
      <MediaGrid items={items} />

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
