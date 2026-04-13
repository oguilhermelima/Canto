"use client";

import { useCallback, useMemo, useState } from "react";
import { BrowseLayout } from "~/components/layout/browse-layout";
import type { FilterOutput, BrowseItem } from "~/components/layout/browse-layout";
import { historyStrategy } from "~/components/layout/card-strategies";
import { StateMessage } from "~/components/layout/state-message";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { useViewMode } from "~/hooks/use-view-mode";
import { trpc } from "~/lib/trpc/client";

const PAGE_SIZE = 40;

export default function HistoryPage(): React.JSX.Element {
  useDocumentTitle("Watch History");

  const [mediaType, setMediaType] = useState<"all" | "movie" | "show">("all");
  const [filters, setFilters] = useState<FilterOutput>({});
  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.history", "list");

  const queryMediaType = mediaType === "all" ? undefined : mediaType;

  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = trpc.userMedia.getLibraryHistory.useInfiniteQuery(
    {
      limit: PAGE_SIZE,
      mediaType: queryMediaType,
      source: filters.source,
      sortBy: filters.sortBy as "recently_watched" | "name_asc" | "name_desc" | "year_desc" | "year_asc" | undefined,
      yearMin: filters.yearMin ? Number(filters.yearMin) : undefined,
      yearMax: filters.yearMax ? Number(filters.yearMax) : undefined,
      genreIds: filters.genreIds,
      watchStatus: filters.watchStatus,
      scoreMin: filters.scoreMin,
      scoreMax: filters.scoreMax,
      runtimeMin: filters.runtimeMin,
      runtimeMax: filters.runtimeMax,
      language: filters.language,
      certification: filters.certification,
      tvStatus: filters.status,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const items: BrowseItem[] = useMemo(
    () =>
      (data?.pages.flatMap((page) => page.items) ?? []).map((entry) => ({
        id: entry.id,
        externalId: entry.externalId,
        provider: entry.provider,
        type: entry.mediaType as "movie" | "show",
        title: entry.title,
        posterPath: entry.posterPath,
        year: entry.year ?? null,
        entryType: entry.entryType as "history" | "playback",
        watchedAt: entry.watchedAt,
        source: entry.source,
        episode: entry.episode,
        progress: entry.progressPercent != null
          ? {
              percent: entry.progressPercent,
              value: entry.progressValue ?? 0,
              total: entry.progressTotal ?? 0,
              unit: (entry.progressUnit ?? "seconds") as "seconds" | "episodes",
            }
          : null,
        isCompleted: entry.isCompleted ?? null,
      })),
    [data],
  );

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <BrowseLayout
      title="Watch History"
      subtitle="A timeline of everything you've watched."
      items={items}
      strategy={historyStrategy}
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
      emptyState={
        <StateMessage
          title="Stellar silence"
          description="Your watch history will build up here as you journey through movies and shows."
        />
      }
      errorState={isError ? <StateMessage preset="error" onRetry={() => void refetch()} /> : undefined}
    />
  );
}
