"use client";

import { useCallback, useMemo, useState } from "react";
import { BrowseLayout } from "~/components/layout/browse-layout";
import type { FilterOutput, BrowseItem } from "~/components/layout/browse-layout";
import { progressStrategy } from "~/components/layout/card-strategies";
import { StateMessage } from "@canto/ui/state-message";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { useViewMode } from "~/hooks/use-view-mode";
import { trpc } from "~/lib/trpc/client";

const PAGE_SIZE = 24;

export default function UpcomingSchedulePage(): React.JSX.Element {
  useDocumentTitle("Upcoming Schedule");

  const [mediaType, setMediaType] = useState<"all" | "movie" | "show">("all");
  const [filters, setFilters] = useState<FilterOutput>({});
  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.upcoming", "grid");

  const queryMediaType = mediaType === "all" ? undefined : mediaType;

  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.userMedia.getUpcomingSchedule.useInfiniteQuery(
      {
        limit: PAGE_SIZE,
        mediaType: queryMediaType,
        q: filters.q,
      },
      { getNextPageParam: (lp) => lp.nextCursor, initialCursor: 0 },
    );

  const allItems: BrowseItem[] = useMemo(
    () =>
      (data?.pages.flatMap((p) => p.items) ?? []).map((item) => ({
        id: item.id,
        externalId: item.externalId,
        provider: item.provider,
        type: item.mediaType as "movie" | "show",
        title: item.title,
        posterPath: item.posterPath,
        backdropPath: item.backdropPath,
        year: item.year,
        releaseAt: item.releaseAt,
        episode: item.episode,
      })),
    [data],
  );

  const items = useMemo(
    () => mediaType === "all" ? allItems : allItems.filter((i) => i.type === mediaType),
    [allItems, mediaType],
  );

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <BrowseLayout
      title="Upcoming Schedule"
      subtitle="New episodes and releases on the horizon."
      items={items}
      strategy={progressStrategy}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      onFetchNextPage={handleFetchNextPage}
      filterPreset="library"
      onFilterChange={setFilters}
      mediaType={mediaType}
      onMediaTypeChange={setMediaType}
      emptyState={<StateMessage preset="emptyUpcoming" />}
      errorState={isError ? <StateMessage preset="error" onRetry={() => void refetch()} /> : undefined}
    />
  );
}
