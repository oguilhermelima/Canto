"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { trpc } from "~/lib/trpc/client";
import { BrowseLayout, type FilterOutput } from "~/components/layout/browse-layout";
import { StateMessage } from "~/components/layout/state-message";

export function RecommendedSection(): React.JSX.Element {
  const [filters, setFilters] = useState<FilterOutput>({});
  const [mediaType, setMediaType] = useState<"movie" | "show" | "all">("all");

  useEffect(() => {
    document.title = "Recommended for you — Canto";
  }, []);

  const queryInput = useMemo(
    () => ({
      pageSize: 20 as const,
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
    }),
    [filters],
  );

  const query = trpc.media.recommendations.useInfiniteQuery(queryInput, {
    staleTime: 10 * 60 * 1000,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialCursor: 0,
  });

  const { items, totalResults } = useMemo(() => {
    const allItems = (query.data?.pages ?? []).flatMap((p) => p.items);
    const seen = new Set<number>();
    const deduped = allItems.filter((r) => {
      if (seen.has(r.externalId)) return false;
      seen.add(r.externalId);
      return true;
    });
    const filtered = mediaType === "all"
      ? deduped
      : deduped.filter((r) => r.type === mediaType);
    return {
      items: filtered.map((r) => ({
        externalId: r.externalId,
        provider: r.provider,
        type: r.type,
        title: r.title,
        posterPath: r.posterPath ?? null,
        year: r.year,
        voteAverage: r.voteAverage,
      })),
      totalResults: filtered.length,
    };
  }, [query.data, mediaType]);

  const fetchNextPage = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage)
      void query.fetchNextPage();
  }, [query]);

  if (query.isError) {
    return (
      <BrowseLayout
        title="Recommended for you"
        subtitle="Handpicked based on your library and taste."
        items={[]}
        totalResults={0}
        isLoading={false}
        isFetchingNextPage={false}
        hasNextPage={false}
        onFetchNextPage={fetchNextPage}
        onFilterChange={setFilters}
        mediaType={mediaType}
        onMediaTypeChange={setMediaType}
        emptyState={<StateMessage preset="error" onRetry={() => void query.refetch()} />}
      />
    );
  }

  return (
    <BrowseLayout
      title="Recommended for you"
      subtitle="Handpicked based on your library and taste."
      items={items}
      totalResults={totalResults}
      isLoading={query.isLoading}
      isFetchingNextPage={query.isFetchingNextPage}
      hasNextPage={query.hasNextPage ?? false}
      onFetchNextPage={fetchNextPage}
      onFilterChange={setFilters}
      mediaType={mediaType}
      onMediaTypeChange={setMediaType}
      emptyState={<StateMessage preset="emptyGrid" />}
    />
  );
}
