"use client";

import { useCallback, useMemo } from "react";
import type { SectionItem } from "../section-item";

interface InfiniteLike<TPage> {
  data: { pages: TPage[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  hasNextPage: boolean | undefined;
  fetchNextPage: () => void | Promise<unknown>;
  isFetchingNextPage: boolean;
  refetch: () => void | Promise<unknown>;
}

interface QueryLike<TData> {
  data: TData | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => void | Promise<unknown>;
}

interface SectionInfiniteResult<TItem> {
  items: TItem[];
  isLoading: boolean;
  isError: boolean;
  isFetchingMore: boolean;
  onLoadMore: (() => void) | undefined;
  onRetry: () => void;
}

interface SectionQueryResult {
  items: SectionItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function useSectionInfiniteQuery<
  TPage,
  TRaw extends { provider: string; externalId: number | string },
  TItem = SectionItem,
>(
  query: InfiniteLike<TPage>,
  getItems: (page: TPage) => TRaw[],
  mapItem: (raw: TRaw) => TItem,
  dedupWithin = false,
): SectionInfiniteResult<TItem> {
  const items = useMemo<TItem[]>(() => {
    const raws = (query.data?.pages ?? []).flatMap(getItems);
    if (!dedupWithin) return raws.map(mapItem);
    const seen = new Set<string>();
    const results: TItem[] = [];
    for (const raw of raws) {
      const key = `${raw.provider}-${raw.externalId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(mapItem(raw));
    }
    return results;
  }, [query.data]);

  const onLoadMore = useCallback(() => {
    if (query.hasNextPage) void query.fetchNextPage();
  }, [query]);

  const onRetry = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetchingMore: query.isFetchingNextPage,
    onLoadMore: query.hasNextPage ? onLoadMore : undefined,
    onRetry,
  };
}

export function useSectionQuery<TData, TRaw>(
  query: QueryLike<TData>,
  getItems: (data: TData) => TRaw[],
  mapItem: (raw: TRaw) => SectionItem,
): SectionQueryResult {
  const items = useMemo<SectionItem[]>(() => {
    if (query.data === undefined) return [];
    return getItems(query.data).map(mapItem);
  }, [query.data]);

  const onRetry = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    onRetry,
  };
}
