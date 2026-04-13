"use client";

import { useMemo, useCallback } from "react";
import { trpc } from "~/lib/trpc/client";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";

interface WatchNextSourceProps {
  title: string;
  style: string;
}

export function WatchNextSource({ title, style }: WatchNextSourceProps): React.JSX.Element {
  return <WatchNextDynamic title={title} style={style} />;
}

function WatchNextDynamic({ title, style }: WatchNextSourceProps): React.JSX.Element | null {
  const query = trpc.userMedia.getLibraryWatchNext.useInfiniteQuery(
    { limit: 24, view: "watch_next" as const },
    { getNextPageParam: (lp) => lp.nextCursor, initialCursor: 0 },
  );

  const items = useMemo<SectionItem[]>(
    () =>
      (query.data?.pages.flatMap((p) => p.items) ?? []).map((item) => ({
        externalId: item.externalId,
        provider: item.provider,
        type: item.mediaType as "movie" | "show",
        title: item.title,
        posterPath: item.posterPath,
        backdropPath: item.backdropPath,
        logoPath: item.logoPath,
        trailerKey: item.trailerKey,
        overview: item.overview,
        voteAverage: item.voteAverage,
        genres: (item.genres as string[] | null) ?? undefined,
        genreIds: (item.genreIds as number[] | null) ?? undefined,
        year: item.year,
        progress:
          item.progressPercent != null &&
          item.progressValue != null &&
          item.progressTotal != null &&
          item.progressUnit != null
            ? {
                percent: item.progressPercent,
                value: item.progressValue,
                total: item.progressTotal,
                unit: item.progressUnit,
              }
            : null,
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
      seeAllHref="/library/watch-next"
      items={items}
      isLoading={query.isLoading}
      isError={query.isError}
      isFetchingMore={query.isFetchingNextPage}
      onLoadMore={query.hasNextPage ? handleLoadMore : undefined}
      onRetry={() => query.refetch()}
    />
  );
}
