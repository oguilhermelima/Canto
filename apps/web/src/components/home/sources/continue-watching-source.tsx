"use client";

import { useMemo, useCallback } from "react";
import { trpc } from "~/lib/trpc/client";
import { WatchNextTab } from "~/app/(app)/library/_components/watch-next-tab";
import type { SectionItem } from "../section-item";
import { DynamicSection } from "../dynamic-section";

interface ContinueWatchingSourceProps {
  title: string;
  style: string;
  isFirstSection?: boolean;
}

export function ContinueWatchingSource({ title, style, isFirstSection }: ContinueWatchingSourceProps): React.JSX.Element {
  if (style === "large_video") {
    return <WatchNextTab view="continue" title={title} seeAllHref="/library/watched" />;
  }

  return <ContinueWatchingDynamic title={title} style={style} isFirstSection={isFirstSection} />;
}

function ContinueWatchingDynamic({ title, style, isFirstSection }: ContinueWatchingSourceProps): React.JSX.Element | null {
  const query = trpc.userMedia.getLibraryWatchNext.useInfiniteQuery(
    { limit: 24, view: "continue" as const },
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
        overview: item.overview,
        voteAverage: item.voteAverage,
        genres: (item.genres as string[] | null) ?? undefined,
        genreIds: (item.genreIds as number[] | null) ?? undefined,
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
      seeAllHref="/library/watched"
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
