"use client";

import { useCallback, useMemo, useState } from "react";
import type { BrowseItem, FilterOutput } from "~/components/layout/browse-layout";
import { trpc } from "~/lib/trpc/client";

export type LibraryView = "watched" | "history" | "watch_next" | "continue";

const PAGE_SIZE = 40;

interface UseLibraryBrowseResult {
  items: BrowseItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
  mediaType: "all" | "movie" | "show";
  setMediaType: (type: "all" | "movie" | "show") => void;
  filters: FilterOutput;
  setFilters: (filters: FilterOutput) => void;
}

export function useLibraryBrowse({ view }: { view: LibraryView }): UseLibraryBrowseResult {
  const [mediaType, setMediaType] = useState<"all" | "movie" | "show">("all");
  const [filters, setFilters] = useState<FilterOutput>({});

  const queryMediaType = mediaType === "all" ? undefined : mediaType;
  const sortBy = filters.sortBy as
    | "recently_watched"
    | "name_asc"
    | "name_desc"
    | "year_desc"
    | "year_asc"
    | undefined;
  const yearMin = filters.yearMin ? Number(filters.yearMin) : undefined;
  const yearMax = filters.yearMax ? Number(filters.yearMax) : undefined;

  const useHistory = view === "watched" || view === "history";

  const historyQuery = trpc.userMedia.getLibraryHistory.useInfiniteQuery(
    {
      limit: PAGE_SIZE,
      mediaType: queryMediaType,
      completedOnly: view === "watched" ? true : undefined,
      watchStatus: view === "history" ? filters.watchStatus : undefined,
      source: filters.source,
      sortBy,
      yearMin,
      yearMax,
      genreIds: filters.genreIds,
      scoreMin: filters.scoreMin,
      scoreMax: filters.scoreMax,
      runtimeMin: filters.runtimeMin,
      runtimeMax: filters.runtimeMax,
      language: filters.language,
      certification: filters.certification,
      tvStatus: filters.status,
    },
    {
      enabled: useHistory,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const watchNextQuery = trpc.userMedia.getLibraryWatchNext.useInfiniteQuery(
    {
      limit: PAGE_SIZE,
      view: view === "watch_next" ? "watch_next" : "continue",
      mediaType: queryMediaType,
      source: filters.source,
      sortBy,
      yearMin,
      yearMax,
      genreIds: filters.genreIds,
      scoreMin: filters.scoreMin,
      scoreMax: filters.scoreMax,
      runtimeMin: filters.runtimeMin,
      runtimeMax: filters.runtimeMax,
      language: filters.language,
      certification: filters.certification,
      tvStatus: filters.status,
    },
    {
      enabled: !useHistory,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: 0,
    },
  );

  const active = useHistory ? historyQuery : watchNextQuery;

  const items: BrowseItem[] = useMemo(() => {
    if (useHistory) {
      return (historyQuery.data?.pages.flatMap((page) => page.items) ?? []).map((entry) => ({
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
      }));
    }
    return (watchNextQuery.data?.pages.flatMap((page) => page.items) ?? []).map((item) => ({
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
    }));
  }, [useHistory, historyQuery.data, watchNextQuery.data]);

  const onFetchNextPage = useCallback(() => {
    if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
  }, [active]);

  return {
    items,
    isLoading: active.isLoading,
    isError: active.isError,
    refetch: () => void active.refetch(),
    hasNextPage: active.hasNextPage ?? false,
    isFetchingNextPage: active.isFetchingNextPage,
    onFetchNextPage,
    mediaType,
    setMediaType,
    filters,
    setFilters,
  };
}
