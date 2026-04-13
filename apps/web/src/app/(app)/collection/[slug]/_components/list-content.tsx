"use client";

import type { RefObject } from "react";
import { Film, Loader2, Tv } from "lucide-react";
import { useRouter } from "next/navigation";
import { TabBar } from "~/components/layout/tab-bar";
import { MediaGrid } from "~/components/media/media-grid";
import { MediaListView } from "~/components/media/media-list-view";
import { StateMessage } from "~/components/layout/state-message";
import { ViewModeToggle  } from "~/components/layout/view-mode-toggle";
import type {ViewMode} from "~/components/layout/view-mode-toggle";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies", icon: Film },
  { value: "show", label: "TV Shows", icon: Tv },
];

interface ListContentProps {
  items: {
    id: string;
    externalId?: string;
    provider?: string;
    type: "movie" | "show";
    title: string;
    posterPath: string | null;
    year?: number;
    voteAverage?: number;
    overview?: string | null;
    totalRating?: number;
    voteCount?: number;
  }[];
  isLoading: boolean;
  typeFilter: "all" | "movie" | "show";
  onTypeChange: (type: "all" | "movie" | "show") => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sentinelRef: RefObject<HTMLDivElement | null>;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}

export function ListContent({
  items,
  isLoading,
  typeFilter,
  onTypeChange,
  showFilters,
  onToggleFilters,
  viewMode,
  onViewModeChange,
  sentinelRef,
  isFetchingNextPage,
  hasNextPage,
}: ListContentProps): React.JSX.Element {
  const router = useRouter();

  return (
    <div className="min-w-0 flex-1">
      <TabBar
        tabs={TYPE_OPTIONS}
        value={typeFilter}
        onChange={(v) => onTypeChange(v as "all" | "movie" | "show")}
        onFilter={onToggleFilters}
        filterActive={showFilters}
        trailing={<ViewModeToggle value={viewMode} onChange={onViewModeChange} className="hidden md:flex" />}
      />
      <div className="mb-4 -mt-2 flex justify-end md:hidden">
        <ViewModeToggle value={viewMode} onChange={onViewModeChange} />
      </div>

      {!isLoading && items.length === 0 ? (
        <StateMessage
          preset="emptyList"
          action={{ label: "Discover Media", onClick: () => router.push("/") }}
        />
      ) : (
        <>
          {viewMode === "grid" ? (
            <MediaGrid items={items} isLoading={isLoading} compact={showFilters} />
          ) : (
            <MediaListView items={items} isLoading={isLoading} compact={showFilters} />
          )}

          <div ref={sentinelRef} className="h-1" />

          {isFetchingNextPage && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!hasNextPage && !isFetchingNextPage && items.length > 0 && !isLoading && (
            <StateMessage preset="endOfItems" inline />
          )}
        </>
      )}
    </div>
  );
}
