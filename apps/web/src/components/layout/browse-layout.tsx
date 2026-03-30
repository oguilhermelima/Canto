"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { cn } from "@canto/ui/cn";
import { Loader2, Settings2 } from "lucide-react";
import { MediaGrid } from "~/components/media/media-grid";
import { PageHeader } from "~/components/layout/page-header";
import {
  MediaFilterSidebar,
  type FilterState,
} from "~/components/media/media-filter-sidebar";

const DEFAULT_FILTERS: FilterState = {
  sortBy: "popularity",
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

interface MediaItem {
  externalId: number;
  provider: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year: number | undefined;
  voteAverage: number | undefined;
  popularity?: number | null;
  genreIds?: number[];
}

interface BrowseLayoutProps {
  /** Page title shown in the header */
  title: string;
  /** Media type for the filter sidebar */
  mediaType: "all" | "movie" | "show";
  /** Toolbar items rendered between filter button and result count */
  toolbar?: React.ReactNode;
  /** All loaded items (will be client-side filtered) */
  items: MediaItem[];
  /** Total results from the API */
  totalResults: number;
  /** Loading state for initial load */
  isLoading: boolean;
  /** Whether more pages are being fetched */
  isFetchingNextPage: boolean;
  /** Whether there are more pages to load */
  hasNextPage: boolean;
  /** Callback to load the next page */
  onFetchNextPage: () => void;
  /** Empty state content */
  emptyState?: React.ReactNode;
  /** Hide the title (e.g. for search page where topbar handles it) */
  hideTitle?: boolean;
}

export function BrowseLayout({
  title,
  mediaType,
  toolbar,
  items,
  totalResults,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  onFetchNextPage,
  emptyState,
  hideTitle = false,
}: BrowseLayoutProps): React.JSX.Element {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  const handleFilterReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // Apply client-side filters
  const filteredItems = useMemo(() => {
    return items.filter((r) => {
      if (r.year) {
        const yearMin = filters.yearMin ? Number(filters.yearMin) : 0;
        const yearMax = filters.yearMax ? Number(filters.yearMax) : 9999;
        if (r.year < yearMin || r.year > yearMax) return false;
      }
      const minScore = filters.scoreMin[0] ?? 0;
      if (minScore > 0 && r.voteAverage != null && r.voteAverage < minScore)
        return false;
      if (filters.genres.size > 0 && r.genreIds) {
        const hasGenre = r.genreIds.some((id) =>
          filters.genres.has(String(id)),
        );
        if (!hasGenre) return false;
      }
      return true;
    });
  }, [items, filters]);

  const gridItems = filteredItems.map((r) => ({
    externalId: String(r.externalId),
    provider: r.provider,
    type: r.type,
    title: r.title,
    posterPath: r.posterPath,
    year: r.year,
    voteAverage: r.voteAverage,
  }));

  // Intersection observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          onFetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onFetchNextPage]);

  return (
    <div className="w-full">
      {!hideTitle && (
        <PageHeader
          title={title}
          className={cn(
            "transition-[margin] duration-300 ease-in-out",
            showFilters && "md:ml-[17rem] lg:ml-[19rem]",
          )}
        />
      )}

      <div className="px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
      {/* Fixed Sidebar — uses fixed positioning so it never scrolls */}
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
          mediaType={mediaType}
          filters={filters}
          onChange={handleFilterChange}
          onReset={handleFilterReset}
        />
      </div>

      {/* Main content — shifts right when sidebar is open */}
      <div
        className={cn(
          "transition-[margin] duration-300 ease-in-out",
          showFilters && "md:ml-[17rem] lg:ml-[19rem]",
        )}
      >
        {/* Toolbar — sticky below topbar */}
        <div className="sticky top-14 z-20 -mx-4 mb-6 flex items-center justify-between border-b border-border/40 bg-background px-4 py-3 md:top-16 md:-mx-8 md:px-8 lg:-mx-12 lg:px-12 xl:-mx-16 xl:px-16 2xl:-mx-24 2xl:px-24">
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
            {toolbar}
          </div>
          {totalResults > 0 && !isLoading && (
            <span className="text-sm text-muted-foreground">
              {totalResults.toLocaleString()} results
            </span>
          )}
        </div>

        {/* Content */}
        {!isLoading && items.length === 0 && emptyState ? (
          emptyState
        ) : (
          <>
            <MediaGrid
              items={gridItems}
              isLoading={isLoading}
              skeletonCount={18}
              compact={showFilters}
            />

            <div ref={sentinelRef} className="h-1" />

            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!hasNextPage && gridItems.length > 0 && !isLoading && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No more results
              </p>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
