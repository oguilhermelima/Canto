"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { trpc } from "~/lib/trpc/client";
import { BrowseLayout, type FilterOutput } from "~/components/layout/browse-layout";
import { StateMessage } from "~/components/layout/state-message";
import { PRESETS, DEFAULT_PRESET } from "../_components/constants";

export function DiscoverPresetSection({ presetKey }: { presetKey: string }): React.JSX.Element {
  const preset = PRESETS[presetKey] ?? PRESETS[DEFAULT_PRESET]!;
  const [filters, setFilters] = useState<FilterOutput>({});
  const [mediaType, setMediaType] = useState<"movie" | "show" | "all">(preset.type);

  useEffect(() => {
    document.title = `${preset.title} — Canto`;
  }, [preset.title]);

  const hasFilters = Object.keys(filters).length > 0;

  const queryInput = useMemo(
    () => ({
      type: mediaType === "all" ? preset.type : mediaType as "movie" | "show",
      mode: (hasFilters || (mediaType !== "all" && mediaType !== preset.type) ? "discover" : (preset.mode ?? "trending")) as "trending" | "discover",
      genres: filters.genres ?? preset.genres,
      language: filters.language ?? preset.language,
      sortBy: filters.sortBy,
      scoreMin: filters.scoreMin,
      runtimeMin: filters.runtimeMin,
      runtimeMax: filters.runtimeMax,
      certification: filters.certification,
      status: filters.status,
      watchProviders: filters.watchProviders,
      watchRegion: filters.watchRegion,
      dateFrom: filters.yearMin ? `${filters.yearMin}-01-01` : undefined,
      dateTo: filters.yearMax ? `${filters.yearMax}-12-31` : undefined,
    }),
    [preset, filters, hasFilters, mediaType],
  );

  const query = trpc.media.browse.useInfiniteQuery(queryInput, {
    staleTime: 10 * 60 * 1000,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const currentPage = (lastPageParam as number) ?? 1;
      if (currentPage >= lastPage.totalPages) return undefined;
      return currentPage + 1;
    },
    initialCursor: 1,
  });

  const { items, totalResults } = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const results = pages.flatMap((p) =>
      p.results.map((r) => ({
        externalId: r.externalId,
        provider: r.provider,
        type: (r.type ?? preset.type) as "movie" | "show",
        title: r.title,
        posterPath: r.posterPath ?? null,
        year: r.year,
        voteAverage: r.voteAverage,
        popularity: r.popularity,
      })),
    );
    const total = pages[0]?.totalResults ?? results.length;
    return { items: results, totalResults: total };
  }, [query.data, preset.type, mediaType]);

  const fetchNextPage = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage)
      void query.fetchNextPage();
  }, [query]);

  if (query.isError) {
    return (
      <BrowseLayout
        title={preset.title}
        subtitle={preset.subtitle}
        items={[]}
        totalResults={0}
        isLoading={false}
        isFetchingNextPage={false}
        hasNextPage={false}
        onFetchNextPage={fetchNextPage}
        onFilterChange={setFilters}
        mediaType={mediaType}
        onMediaTypeChange={setMediaType}
        allowedMediaTypes={[preset.type]}
        emptyState={<StateMessage preset="error" onRetry={() => void query.refetch()} />}
      />
    );
  }

  return (
    <BrowseLayout
      title={preset.title}
      items={items}
      totalResults={totalResults}
      isLoading={query.isLoading}
      isFetchingNextPage={query.isFetchingNextPage}
      hasNextPage={query.hasNextPage ?? false}
      onFetchNextPage={fetchNextPage}
      onFilterChange={setFilters}
      mediaType={mediaType}
      onMediaTypeChange={setMediaType}
      allowedMediaTypes={[preset.type]}
      emptyState={<StateMessage preset="emptyGrid" />}
    />
  );
}
