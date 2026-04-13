"use client";

import { useCallback, useMemo, useState } from "react";
import { BrowseLayout } from "~/components/layout/browse-layout";
import type { FilterOutput, BrowseItem } from "~/components/layout/browse-layout";
import { progressStrategy } from "~/components/layout/card-strategies";
import { StateMessage } from "~/components/layout/state-message";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { useViewMode } from "~/hooks/use-view-mode";
import { trpc } from "~/lib/trpc/client";

const PAGE_SIZE = 40;

export default function WatchNextPage(): React.JSX.Element {
  useDocumentTitle("Watch Next");

  const [mediaType, setMediaType] = useState<"all" | "movie" | "show">("all");
  const [filters, setFilters] = useState<FilterOutput>({});
  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.watchNext", "list");

  const queryMediaType =
    mediaType === "all" ? undefined : mediaType;

  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.userMedia.getLibraryWatchNext.useInfiniteQuery(
      {
        limit: PAGE_SIZE,
        view: "watch_next",
        mediaType: queryMediaType,
        source: filters.source,
        sortBy: filters.sortBy as "recently_watched" | "name_asc" | "name_desc" | "year_desc" | "year_asc" | undefined,
        yearMin: filters.yearMin ? Number(filters.yearMin) : undefined,
        yearMax: filters.yearMax ? Number(filters.yearMax) : undefined,
        genreIds: filters.genreIds,
        scoreMin: filters.scoreMin,
        scoreMax: filters.scoreMax,
        runtimeMin: filters.runtimeMin,
        runtimeMax: filters.runtimeMax,
        language: filters.language,
        certification: filters.certification,
        tvStatus: filters.status,
      },
      { getNextPageParam: (lp) => lp.nextCursor, initialCursor: 0 },
    );

  const items: BrowseItem[] = useMemo(
    () =>
      (data?.pages.flatMap((p) => p.items) ?? []).map((item) => ({
        id: item.id,
        externalId: item.externalId,
        provider: item.provider,
        type: item.mediaType as "movie" | "show",
        title: item.title,
        posterPath: item.posterPath,
        year: item.year,
        entryType: "playback" as const,
        watchedAt: item.watchedAt ?? new Date(),
        source: item.source,
        episode: item.episode,
        progress: item.progressPercent != null
          ? {
              percent: item.progressPercent,
              value: item.progressValue ?? 0,
              total: item.progressTotal ?? 0,
              unit: (item.progressUnit ?? "seconds") as "seconds" | "episodes",
            }
          : null,
        isCompleted: false,
      })),
    [data],
  );

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <BrowseLayout
      title="Watch Next"
      subtitle="Your next episodes are ready."
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
      emptyState={<StateMessage preset="emptyWatchNext" />}
      errorState={isError ? <StateMessage preset="error" onRetry={() => void refetch()} /> : undefined}
    />
  );
}
