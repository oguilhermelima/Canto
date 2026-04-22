"use client";

import { useCallback, useMemo, useState } from "react";
import { BrowseLayout } from "@/components/layout/browse-layout";
import type { FilterOutput, BrowseItem } from "@/components/layout/browse-layout";
import { browseStrategy } from "@/components/layout/card-strategies";
import { StateMessage } from "@canto/ui/state-message";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useViewMode } from "@/hooks/use-view-mode";
import { trpc } from "@/lib/trpc/client";

const PAGE_SIZE = 20;

export default function RecommendationsPage(): React.JSX.Element {
  useDocumentTitle("Recommendations");

  const [mediaType, setMediaType] = useState<"all" | "movie" | "show">("all");
  const [filters, setFilters] = useState<FilterOutput>({});
  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.recommendations");

  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.media.recommendations.useInfiniteQuery(
      {
        pageSize: PAGE_SIZE,
        genreIds: filters.genres
          ? filters.genres.split(",").map(Number)
          : undefined,
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
        staleTime: 5 * 60 * 1000,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        initialCursor: 0,
      },
    );

  const allItems: BrowseItem[] = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages ?? [])
      .flatMap((p) => p.items)
      .filter((r) => {
        const key = `${r.provider}-${r.externalId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => ({
        id: `${r.provider}-${r.externalId}`,
        externalId: r.externalId,
        provider: r.provider,
        type: r.type as "movie" | "show",
        title: r.title,
        posterPath: r.posterPath ?? null,
        year: r.year ?? undefined,
        voteAverage: r.voteAverage ?? undefined,
      }));
  }, [data]);

  const items = useMemo(
    () =>
      mediaType === "all"
        ? allItems
        : allItems.filter((i) => i.type === mediaType),
    [allItems, mediaType],
  );

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <BrowseLayout
      title="Recommendations"
      subtitle="Personalized picks based on your library."
      items={items}
      totalResults={items.length}
      strategy={browseStrategy}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      onFetchNextPage={handleFetchNextPage}
      filterPreset="tmdb"
      onFilterChange={setFilters}
      mediaType={mediaType}
      onMediaTypeChange={setMediaType}
      emptyState={<StateMessage preset="emptyWatchlist" />}
      errorState={isError ? <StateMessage preset="error" onRetry={() => void refetch()} /> : undefined}
    />
  );
}
