"use client";

import { useCallback, useEffect, useMemo } from "react";
import { trpc } from "~/lib/trpc/client";
import { BrowseLayout } from "~/components/layout/browse-layout";

export default function AnimesPage(): React.JSX.Element {
  useEffect(() => {
    document.title = "Anime — Canto";
  }, []);

  const discover = trpc.media.discover.useInfiniteQuery(
    { type: "show", genres: "16", language: "ja" },
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
    const pages = discover.data?.pages ?? [];
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
  }, [discover.data]);

  const fetchNextPage = useCallback(() => {
    if (discover.hasNextPage && !discover.isFetchingNextPage)
      void discover.fetchNextPage();
  }, [discover]);

  return (
    <BrowseLayout
      title="Anime"
      mediaType="show"
      items={items}
      totalResults={totalResults}
      isLoading={discover.isLoading}
      isFetchingNextPage={discover.isFetchingNextPage}
      hasNextPage={discover.hasNextPage ?? false}
      onFetchNextPage={fetchNextPage}
    />
  );
}
