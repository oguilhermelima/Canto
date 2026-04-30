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

/**
 * Generic helper hook around tRPC infinite queries.
 *
 * NOTE: callers typically pass `getItems` and `mapItem` as inline arrow
 * functions, so they're new on every render. They're listed as deps so the
 * memo stays correct, but in practice the items array is recomputed on each
 * render. That's fine — it's pure synchronous work over already-fetched data,
 * and React Compiler handles downstream memoization. Callers that want to
 * avoid this can stabilise the mappers with `useCallback` or hoist them.
 */
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
  const pages = query.data?.pages;
  const items = useMemo<TItem[]>(() => {
    const raws = (pages ?? []).flatMap(getItems);
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
  }, [pages, getItems, mapItem, dedupWithin]);

  const { hasNextPage, fetchNextPage, refetch } = query;

  const onLoadMore = useCallback(() => {
    if (hasNextPage) void fetchNextPage();
  }, [hasNextPage, fetchNextPage]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

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
  const data = query.data;
  const items = useMemo<SectionItem[]>(() => {
    if (data === undefined) return [];
    return getItems(data).map(mapItem);
  }, [data, getItems, mapItem]);

  const refetch = query.refetch;
  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    onRetry,
  };
}
