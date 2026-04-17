"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@canto/ui/cn";
import { Film, Loader2, Tv } from "lucide-react";
import { PageHeader } from "~/components/page-header";
import { TabBar } from "@canto/ui/tab-bar";
import { StateMessage } from "@canto/ui/state-message";
import { BrowseMenu } from "~/components/layout/browse-menu";
import { AdvancedFilter } from "~/components/layout/advanced-filter";
import { useIsMobile } from "~/hooks/use-is-mobile";
import type { FilterOutput, SectionId } from "~/components/media/filter-sidebar";
import { GRID_COLS } from "~/components/layout/browse-layout.types";
import type { BrowseItem, BrowseMenuItem, BrowseMenuGroup, CardStrategy, FilterPreset, ViewMode } from "~/components/layout/browse-layout.types";

export type { FilterOutput, SectionId, BrowseItem, BrowseMenuItem, BrowseMenuGroup, CardStrategy, FilterPreset, ViewMode };

const MEDIA_TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies", icon: Film },
  { value: "show", label: "TV Shows", icon: Tv },
];

interface BrowseLayoutProps {
  title: string;
  subtitle?: string;
  items: BrowseItem[];
  totalResults?: number;
  strategy: CardStrategy;

  // View mode
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;

  // Infinite scroll
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onFetchNextPage: () => void;

  // Filters (optional — omit filterPreset to hide filter UI)
  filterPreset?: FilterPreset;
  onFilterChange?: (filters: FilterOutput) => void;

  // Media type tabs
  mediaType?: "movie" | "show" | "all";
  onMediaTypeChange?: (type: "movie" | "show" | "all") => void;
  allowedMediaTypes?: ("all" | "movie" | "show")[];

  // Slots
  hideTitle?: boolean;
  toolbar?: React.ReactNode;
  header?: React.ReactNode;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  sidebarClassName?: string;
  /** Extra groups rendered inside the 3-dot menu (below View section) */
  menuGroups?: BrowseMenuGroup[];
  /** Filter sections to hide (e.g. when search mode can't support them) */
  hideSections?: SectionId[];
}

export function BrowseLayout({
  title,
  subtitle,
  items,
  totalResults,
  strategy,
  viewMode,
  onViewModeChange,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  onFetchNextPage,
  filterPreset,
  onFilterChange,
  mediaType = "all",
  onMediaTypeChange,
  allowedMediaTypes,
  hideTitle = false,
  toolbar,
  header,
  emptyState,
  errorState,
  sidebarClassName,
  menuGroups,
  hideSections,
}: BrowseLayoutProps): React.JSX.Element {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleFilterChange = useCallback(
    (filters: FilterOutput) => {
      onFilterChange?.(filters);
    },
    [onFilterChange],
  );

  const handleFilterToggle = useCallback(() => {
    if (isMobile) {
      setMobileFilterOpen(true);
    } else {
      setSidebarOpen((prev) => !prev);
    }
  }, [isMobile]);

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

  // Grid column classes
  const gridCols = strategy.gridCols ?? GRID_COLS;
  const cols = sidebarOpen && !isMobile ? gridCols.compact : gridCols.default;

  // Tabs
  const visibleTabs = allowedMediaTypes
    ? MEDIA_TYPE_TABS.filter((t) => allowedMediaTypes.includes(t.value as "all" | "movie" | "show"))
    : MEDIA_TYPE_TABS;
  const showTypeTabs = onMediaTypeChange && visibleTabs.length >= 1;

  // Results count
  const resultsCount = totalResults != null && totalResults > 0 && !isLoading ? (
    <span className="hidden text-sm text-muted-foreground md:inline">
      {totalResults.toLocaleString()} results
    </span>
  ) : undefined;

  // Trailing element for TabBar
  const trailing = resultsCount;

  // 3-dot menu beside the title
  // Skeleton count
  const skeletonCount = viewMode === "grid" ? 18 : 8;

  return (
    <div className="w-full pb-12">
      {!hideTitle && (
        <PageHeader
          title={title}
          subtitle={subtitle}
          action={<BrowseMenu viewMode={viewMode} onViewModeChange={onViewModeChange} groups={menuGroups} />}
        />
      )}

      <div className="flex px-4 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
        {/* Filter (desktop sidebar + mobile dialog) */}
        {filterPreset && onFilterChange && (
          <AdvancedFilter
            preset={filterPreset}
            mediaType={mediaType}
            sidebarOpen={sidebarOpen}
            mobileOpen={mobileFilterOpen}
            onMobileOpenChange={setMobileFilterOpen}
            onFilterChange={handleFilterChange}
            sidebarClassName={sidebarClassName}
            hideSections={hideSections}
          />
        )}

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {header}

          {/* Toolbar */}
          {showTypeTabs ? (
            <TabBar
              tabs={visibleTabs}
              value={mediaType}
              onChange={(v) => onMediaTypeChange!(v as "movie" | "show" | "all")}
              onFilter={filterPreset ? handleFilterToggle : undefined}
              filterActive={sidebarOpen && !isMobile}
              leading={toolbar}
              trailing={trailing}
            />
          ) : (
            <TabBar
              tabs={[]}
              value=""
              onChange={() => {}}
              onFilter={filterPreset ? handleFilterToggle : undefined}
              filterActive={sidebarOpen && !isMobile}
              leading={toolbar}
              trailing={trailing}
            />
          )}

          {/* Error state */}
          {errorState ? (
            errorState
          ) : /* Loading state */
          isLoading ? (
            viewMode === "grid" ? (
              <div className={cn("grid gap-6", cols)}>
                {Array.from({ length: skeletonCount }).map((_, i) => (
                  <div key={i}>{strategy.gridSkeleton()}</div>
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {Array.from({ length: skeletonCount }).map((_, i) => (
                  <div key={i}>{strategy.listSkeleton()}</div>
                ))}
              </div>
            )
          ) : /* Empty state */
          items.length === 0 && emptyState ? (
            emptyState
          ) : /* Content */
          items.length === 0 ? (
            <StateMessage preset="emptyGrid" minHeight="300px" />
          ) : (
            <>
              {viewMode === "grid" ? (
                <div className={cn("grid gap-6", cols)}>
                  {items.map((item) => (
                    <div key={item.id}>{strategy.gridCard(item)}</div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {items.map((item) => (
                    <div key={item.id}>{strategy.listCard(item)}</div>
                  ))}
                </div>
              )}

              <div ref={sentinelRef} className="h-1" />

              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {!hasNextPage && !isFetchingNextPage && items.length > 0 && (
                <StateMessage preset="endOfItems" inline />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
