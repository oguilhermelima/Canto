"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Search, Library, Settings2, Loader2 } from "lucide-react";
import { trpc } from "~/lib/trpc/client";
import { TabBar } from "~/components/layout/tab-bar";
import { PageHeader } from "~/components/layout/page-header";
import { MediaGrid } from "~/components/media/media-grid";
import {
  MediaFilterSidebar,
  type FilterState,
} from "~/components/media/media-filter-sidebar";

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "show", label: "TV Shows" },
  { value: "movie", label: "Movies" },
] as const;

const DEFAULT_FILTERS: FilterState = {
  sortBy: "addedAt",
  sortOrder: "desc",
  genres: new Set(),
  yearMin: "",
  yearMax: "",
  status: "",
  runtimeMax: "",
  contentRating: "",
  scoreMin: [0],
  language: "",
  provider: "",
};

const PAGE_SIZE = 24;

export default function LibraryPage(): React.JSX.Element {
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "show">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Library — Canto";
  }, []);

  const queryInput = {
    type: typeFilter === "all" ? undefined : typeFilter,
    search: searchQuery.length >= 2 ? searchQuery : undefined,
    genre: filters.genres.size > 0 ? [...filters.genres].join(",") : undefined,
    yearMin: filters.yearMin ? Number(filters.yearMin) : undefined,
    yearMax: filters.yearMax ? Number(filters.yearMax) : undefined,
    status: filters.status || undefined,
    runtimeMax: filters.runtimeMax ? Number(filters.runtimeMax) : undefined,
    contentRating: filters.contentRating || undefined,
    scoreMin: (filters.scoreMin[0] ?? 0) > 0 ? filters.scoreMin[0] : undefined,
    language: filters.language || undefined,
    provider: (filters.provider || undefined) as "tmdb" | "anilist" | "tvdb" | undefined,
    pageSize: PAGE_SIZE,
    sortBy: filters.sortBy as "title" | "year" | "addedAt" | "voteAverage" | "popularity" | "releaseDate",
    sortOrder: filters.sortOrder,
  };

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    trpc.library.list.useInfiniteQuery(
      queryInput,
      {
        getNextPageParam: (lastPage) => {
          const nextPage = lastPage.page + 1;
          const totalPages = Math.ceil(lastPage.total / lastPage.pageSize);
          return nextPage <= totalPages ? nextPage : undefined;
        },
        initialCursor: 1,
      },
    );

  const items = (data?.pages ?? []).flatMap((page) =>
    page.items.map((item) => ({
      id: item.id,
      type: item.type as "movie" | "show",
      title: item.title,
      posterPath: item.posterPath,
      year: item.year,
      voteAverage: item.voteAverage,
      inLibrary: true,
      href: `/media/${item.id}`,
    })),
  );

  const total = data?.pages[0]?.total ?? 0;

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleTypeChange = useCallback((type: "all" | "movie" | "show") => {
    setTypeFilter(type);
  }, []);

  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return (
    <div className="w-full">
      <PageHeader
        title="Library"
        className={cn(
          "transition-[margin] duration-300 ease-in-out",
          showFilters && "md:ml-[17rem] lg:ml-[19rem]",
        )}
      />

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {/* Fixed Sidebar */}
      <div
        className={cn(
          "fixed top-16 z-[35] hidden transition-[left,opacity] duration-300 ease-in-out md:block",
          showFilters
            ? "left-4 opacity-100 md:left-8 lg:left-12 xl:left-16 2xl:left-24"
            : "-left-72 opacity-0",
        )}
        style={{ width: "16rem", height: "calc(100vh - 5rem)", top: "5rem" }}
      >
        <MediaFilterSidebar
          mediaType={typeFilter}
          filters={filters}
          onChange={handleFilterChange}
          onReset={handleReset}
        />
      </div>

      {/* Content */}
      <div
        className={cn(
          "transition-[margin] duration-300 ease-in-out",
          showFilters && "md:ml-[17rem] lg:ml-[19rem]",
        )}
      >
        {/* Toolbar */}
        <div className="sticky top-14 z-20 -mx-4 mb-4 flex flex-col gap-4 bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:static md:-mx-8 md:px-8 lg:-mx-12 lg:px-12 xl:-mx-16 xl:px-16 2xl:-mx-24 2xl:px-24">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={cn(
                "hidden h-8 items-center gap-1.5 rounded-xl bg-muted px-4 text-sm font-medium transition-all md:inline-flex",
                showFilters
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Settings2 className={cn("h-4 w-4 transition-transform duration-300", showFilters && "rotate-90")} />
              Filters
            </button>
            <TabBar
              tabs={TYPE_TABS.map(({ value, label }) => ({ value, label }))}
              value={typeFilter}
              onChange={(v) => handleTypeChange(v as "all" | "movie" | "show")}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter library..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-[200px] pl-9 text-sm"
              />
            </div>
            {total > 0 && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {total} item{total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Grid */}
        {!isLoading && items.length === 0 ? (
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <Library className="mx-auto mb-4 h-16 w-16 text-muted-foreground/30" />
              <h2 className="mb-2 text-lg font-medium">Your library is empty</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Start by discovering movies and TV shows, then add them to your library.
              </p>
              <Button className="mt-4" asChild>
                <a href="/">Discover Media</a>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <MediaGrid
              items={items}
              isLoading={isLoading}
              skeletonCount={PAGE_SIZE}
              compact={showFilters}
            />

            <div ref={sentinelRef} className="h-1" />

            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!hasNextPage && items.length > 0 && !isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                All {total} items loaded
              </p>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
