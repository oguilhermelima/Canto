"use client";

import { useMemo, useCallback } from "react";
import { trpc } from "~/lib/trpc/client";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";

interface UserMediaSourceProps {
  title: string;
  style: string;
  filter: { status?: string; isFavorite?: boolean };
  isFirstSection?: boolean;
}

export function UserMediaSource({ title, style, filter, isFirstSection }: UserMediaSourceProps): React.JSX.Element | null {
  const query = trpc.userMedia.getUserMedia.useInfiniteQuery(
    {
      limit: 20,
      status: filter.status as "planned" | "watching" | "completed" | "dropped" | undefined,
      isFavorite: filter.isFavorite,
      sortBy: "updatedAt",
      sortOrder: "desc",
    },
    {
      getNextPageParam: (lp) => lp.nextCursor ?? undefined,
      initialCursor: 0,
    },
  );

  const items = useMemo<SectionItem[]>(
    () =>
      (query.data?.pages.flatMap((p) => p.items) ?? []).map((item) => ({
        externalId: item.externalId,
        provider: item.provider,
        type: item.mediaType as "movie" | "show",
        title: item.title,
        posterPath: item.posterPath,
        backdropPath: null,
        year: item.year,
      })),
    [query.data],
  );

  const handleLoadMore = useCallback(() => {
    if (query.hasNextPage) void query.fetchNextPage();
  }, [query]);

  return (
    <DynamicSection
      style={style}
      title={title}
      items={items}
      isLoading={query.isLoading}
      isError={query.isError}
      isFetchingMore={query.isFetchingNextPage}
      onLoadMore={query.hasNextPage ? handleLoadMore : undefined}
      onRetry={() => query.refetch()}
      isFirstSection={isFirstSection}
    />
  );
}
