"use client";

import { useCallback, useEffect, useMemo } from "react";
import { trpc } from "~/lib/trpc/client";
import { BrowseLayout } from "~/components/layout/browse-layout";

export default function SeriesPage(): React.JSX.Element {
  useEffect(() => {
    document.title = "TV Shows — Canto";
  }, []);

  const trending = trpc.media.discover.useInfiniteQuery(
    { type: "show" },
    {
      getNextPageParam: (lastPage, _allPages, lastPageParam) => {
        const currentPage = (lastPageParam as number) ?? 1;
        if (currentPage >= lastPage.totalPages) return undefined;
        return currentPage + 1;
      },
      initialCursor: 1,
    },
  );

  const { items, totalResults } = useMemo(() => {
    const pages = trending.data?.pages ?? [];
    const results = pages.flatMap((p) =>
      p.results.map((r) => ({
        externalId: r.externalId,
        provider: r.provider,
        type: "show" as const,
        title: r.title,
        posterPath: r.posterPath ?? null,
        year: r.year,
        voteAverage: r.voteAverage,
        popularity: r.popularity,
        genreIds: r.genreIds as number[] | undefined,
      })),
    );
    const total = pages[0]?.totalResults ?? results.length;
    return { items: results, totalResults: total };
  }, [trending.data]);

  const fetchNextPage = useCallback(() => {
    if (trending.hasNextPage && !trending.isFetchingNextPage)
      void trending.fetchNextPage();
  }, [trending]);

  return (
    <BrowseLayout
      title="TV Shows"
      mediaType="show"
      items={items}
      totalResults={totalResults}
      isLoading={trending.isLoading}
      isFetchingNextPage={trending.isFetchingNextPage}
      hasNextPage={trending.hasNextPage ?? false}
      onFetchNextPage={fetchNextPage}
    />
  );
}
