"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@canto/ui/cn";
import { Film, Loader2, Settings2, Tv } from "lucide-react";
import { MediaGrid } from "~/components/media/media-grid";
import { PageHeader } from "~/components/layout/page-header";
import { TabBar } from "~/components/layout/tab-bar";
import { StateMessage } from "~/components/layout/state-message";
import { FilterSidebar  } from "~/components/media/filter-sidebar";
import type {FilterOutput} from "~/components/media/filter-sidebar";

export type { FilterOutput };

const MEDIA_TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies", icon: Film },
  { value: "show", label: "TV Shows", icon: Tv },
];

interface MediaItem {
  externalId: number;
  provider: string;
  type: "movie" | "show";
  title: string;
  posterPath: string | null;
  year: number | undefined;
  voteAverage: number | undefined;
  popularity?: number | null;
}

interface BrowseLayoutProps {
  title: string;
  subtitle?: string;
  items: MediaItem[];
  totalResults: number;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onFetchNextPage: () => void;
  onFilterChange?: (filters: FilterOutput) => void;
  mediaType?: "movie" | "show" | "all";
  onMediaTypeChange?: (type: "movie" | "show" | "all") => void;
  emptyState?: React.ReactNode;
  hideTitle?: boolean;
  toolbar?: React.ReactNode;
  header?: React.ReactNode;
  /** When set, only these media types appear in the tab bar. If ≤ 1 tab remains, the tab bar is hidden. */
  allowedMediaTypes?: ("all" | "movie" | "show")[];
}

export function BrowseLayout({
  title,
  subtitle,
  items,
  totalResults,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  onFetchNextPage,
  onFilterChange,
  mediaType = "all",
  onMediaTypeChange,
  emptyState,
  hideTitle = false,
  toolbar,
  header,
  allowedMediaTypes,
}: BrowseLayoutProps): React.JSX.Element {
  const [showFilters, setShowFilters] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleFilterChange = useCallback(
    (filters: FilterOutput) => {
      onFilterChange?.(filters);
    },
    [onFilterChange],
  );

  const gridItems = items.map((r) => ({
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
      {!hideTitle && <PageHeader title={title} subtitle={subtitle} />}

      <div className="flex px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Sidebar */}
        <div
          className={cn(
            "hidden w-[20rem] shrink-0 transition-[margin,opacity] duration-300 ease-in-out md:block",
            showFilters
              ? "mr-4 opacity-100 lg:mr-8"
              : "-ml-[20rem] mr-0 opacity-0",
          )}
        >
          <FilterSidebar
            mediaType={mediaType}
            onFilterChange={handleFilterChange}
          />
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {header}

          {/* Toolbar */}
          {(() => {
            const visibleTabs = allowedMediaTypes
              ? MEDIA_TYPE_TABS.filter((t) => allowedMediaTypes.includes(t.value as "all" | "movie" | "show"))
              : MEDIA_TYPE_TABS;
            const showTypeTabs = onMediaTypeChange && visibleTabs.length >= 1;

            const filterButton = (
              <button
                type="button"
                className={cn(
                  "hidden h-[38px] w-[38px] items-center justify-center rounded-xl transition-all md:flex",
                  showFilters
                    ? "bg-foreground text-background"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setShowFilters(!showFilters)}
              >
                <Settings2 className={cn("h-4 w-4 transition-transform duration-300", showFilters && "rotate-90")} />
              </button>
            );

            const resultsCount = totalResults > 0 && !isLoading ? (
              <span className="text-sm text-muted-foreground">
                {totalResults.toLocaleString()} results
              </span>
            ) : undefined;

            return showTypeTabs ? (
              <TabBar
                tabs={visibleTabs}
                value={mediaType}
                onChange={(v) => onMediaTypeChange!(v as "movie" | "show" | "all")}
                leading={<div className="flex items-center gap-2">{filterButton}{toolbar}</div>}
                trailing={resultsCount}
              />
            ) : (
              <TabBar
                tabs={[]}
                value=""
                onChange={() => {}}
                leading={<div className="flex items-center gap-2">{filterButton}{toolbar}</div>}
                trailing={resultsCount}
              />
            );
          })()}

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

              {!hasNextPage && !isFetchingNextPage && gridItems.length > 0 && !isLoading && (
                <StateMessage preset="endOfItems" inline />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
