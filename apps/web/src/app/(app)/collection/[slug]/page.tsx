"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { type FilterOutput } from "~/components/media/filter-sidebar";
import { trpc } from "~/lib/trpc/client";
import { useDocumentTitle } from "~/hooks/use-document-title";
import { StateMessage } from "~/components/layout/state-message";
import { PageHeader } from "~/components/layout/page-header";
import { ListFilterSidebar } from "./_components/list-filter-sidebar";
import { ListContent } from "./_components/list-content";

const PAGE_SIZE = 20;

export default function ListDetailPage(): React.JSX.Element {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;

  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "show">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOutput>({});
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.list.getBySlug.useInfiniteQuery(
      {
        slug,
        limit: PAGE_SIZE,
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
      },
      {
        getNextPageParam: (lastPage, _allPages, lastPageParam) => {
          const currentOffset = (lastPageParam as number) ?? 0;
          const nextOffset = currentOffset + PAGE_SIZE;
          if (nextOffset >= lastPage.total) return undefined;
          return nextOffset;
        },
        initialCursor: 0,
      },
    );

  useDocumentTitle(data?.pages[0]?.list.name);

  const handleFilterChange = useCallback((f: FilterOutput) => setFilters(f), []);

  const items = useMemo(() => {
    const all =
      data?.pages.flatMap((page) =>
        page.items.map((item) => ({
          id: item.media.id,
          type: item.media.type as "movie" | "show",
          title: item.media.title,
          posterPath: item.media.posterPath,
          year: item.media.year ?? undefined,
          voteAverage: item.media.voteAverage ?? undefined,
        })),
      ) ?? [];

    return typeFilter === "all" ? all : all.filter((i) => i.type === typeFilter);
  }, [data, typeFilter]);

  const handleFetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) handleFetchNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleFetchNextPage]);

  if (error) {
    return (
      <StateMessage
        preset="notFoundList"
        action={{ label: "Back to Library", onClick: () => router.push("/library") }}
        minHeight="400px"
      />
    );
  }

  return (
    <div className="w-full pb-12">
      <PageHeader
        title={data?.pages[0]?.list.name ?? "List"}
        subtitle={data?.pages[0]?.list.description ?? undefined}
      />

      <div className="flex px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        <ListFilterSidebar
          mediaType={typeFilter}
          visible={showFilters}
          onFilterChange={handleFilterChange}
        />

        <ListContent
          items={items}
          isLoading={isLoading}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          sentinelRef={sentinelRef}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage ?? false}
        />
      </div>
    </div>
  );
}
