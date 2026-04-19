"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@canto/ui/cn";
import { trpc } from "~/lib/trpc/client";
import { MediaCard, MediaCardSkeleton } from "~/components/media/media-card";
import { RatingBadge } from "~/components/media/rating-badge";
import { StateMessage } from "@canto/ui/state-message";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "planned", label: "Planned" },
  { value: "rated", label: "Rated" },
  { value: "favorites", label: "Favorites" },
  { value: "dropped", label: "Dropped" },
] as const;

type FilterKey = (typeof FILTERS)[number]["value"];

const GRID_CLASSES =
  "grid gap-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7";

function filterToInput(
  filter: FilterKey,
): {
  status?: "watching" | "completed" | "planned" | "dropped";
  hasRating?: boolean;
  isFavorite?: boolean;
  sortBy: "updatedAt" | "rating";
  sortOrder: "asc" | "desc";
} {
  switch (filter) {
    case "watching":
      return { status: "watching", sortBy: "updatedAt", sortOrder: "desc" };
    case "completed":
      return { status: "completed", sortBy: "updatedAt", sortOrder: "desc" };
    case "planned":
      return { status: "planned", sortBy: "updatedAt", sortOrder: "desc" };
    case "dropped":
      return { status: "dropped", sortBy: "updatedAt", sortOrder: "desc" };
    case "rated":
      return { hasRating: true, sortBy: "rating", sortOrder: "desc" };
    case "favorites":
      return { isFavorite: true, sortBy: "updatedAt", sortOrder: "desc" };
    case "all":
    default:
      return { sortBy: "updatedAt", sortOrder: "desc" };
  }
}

export function LibraryTab(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filterParam = searchParams.get("filter") as FilterKey | null;
  const activeFilter: FilterKey =
    filterParam && FILTERS.some((f) => f.value === filterParam) ? filterParam : "all";

  const setFilter = useCallback(
    (next: FilterKey) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "library");
      if (next === "all") params.delete("filter");
      else params.set("filter", next);
      router.replace(`/profile/me?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const { data: counts } = trpc.userMedia.getUserMediaCounts.useQuery();

  const queryInput = { ...filterToInput(activeFilter), limit: 24 };

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.userMedia.getUserMedia.useInfiniteQuery(queryInput, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialCursor: 0,
  });

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

  const total = data?.pages[0]?.total ?? 0;

  const totalAll = counts
    ? counts.planned + counts.watching + counts.completed + counts.dropped
    : undefined;

  function countFor(filter: FilterKey): number | undefined {
    if (!counts) return undefined;
    switch (filter) {
      case "all": return totalAll;
      case "watching": return counts.watching;
      case "completed": return counts.completed;
      case "planned": return counts.planned;
      case "rated": return counts.rated;
      case "favorites": return counts.favorites;
      case "dropped": return counts.dropped;
    }
  }

  return (
    <>
      <div className="-mx-5 mb-6 flex gap-1.5 overflow-x-auto px-5 pb-1 scrollbar-none md:-mx-8 md:px-8 lg:-mx-12 lg:px-12 xl:-mx-16 xl:px-16 2xl:-mx-24 2xl:px-24">
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.value;
          const count = countFor(f.value);
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-foreground text-background"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              {count != null && count > 0 && (
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    isActive ? "text-background/70" : "text-muted-foreground/70",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isError ? (
        <StateMessage preset="error" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className={GRID_CLASSES}>
          {Array.from({ length: 12 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <StateMessage
          preset={
            activeFilter === "favorites"
              ? "emptyFavorites"
              : activeFilter === "dropped"
                ? "emptyDropped"
                : activeFilter === "completed"
                  ? "emptyCompleted"
                  : activeFilter === "planned"
                    ? "emptyWatchlist"
                    : activeFilter === "rated"
                      ? "emptyRatings"
                      : "emptyGrid"
          }
        />
      ) : (
        <>
          <div className={GRID_CLASSES}>
            {items.map((item) => (
              <MediaCard
                key={item.id}
                id={item.id}
                externalId={item.externalId}
                provider={item.provider}
                type={item.type}
                title={item.title}
                posterPath={item.posterPath}
                year={item.year}
                className={activeFilter === "dropped" ? "opacity-60 grayscale" : undefined}
                slots={
                  item.rating != null && activeFilter === "rated"
                    ? { topLeft: <RatingBadge variant="user" value={item.rating} /> }
                    : undefined
                }
              />
            ))}
          </div>

          <div ref={sentinelRef} className="h-1" />

          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!hasNextPage && !isFetchingNextPage && items.length > 0 && total > 12 && (
            <StateMessage preset="endOfItems" inline />
          )}
        </>
      )}
    </>
  );
}
