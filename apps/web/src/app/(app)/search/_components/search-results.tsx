"use client";

import { Film, Tv } from "lucide-react";
import { BrowseLayout } from "@/components/layout/browse-layout";
import type { FilterOutput, BrowseItem } from "@/components/layout/browse-layout";
import { browseStrategy } from "@/components/layout/card-strategies";
import { TabBar } from "@canto/ui/tab-bar";
import { StateMessage } from "@canto/ui/state-message";
import { useViewMode } from "@/hooks/use-view-mode";

const TYPE_OPTIONS = [
  { value: "multi" as const, label: "All" },
  { value: "movie" as const, label: "Movies", icon: Film },
  { value: "show" as const, label: "TV Shows", icon: Tv },
];


interface SearchResultsProps {
  header: React.ReactNode;
  searchType: "multi" | "movie" | "show";
  onTypeChange: (type: "multi" | "movie" | "show") => void;
  onFilterChange: (filters: FilterOutput) => void;
  items: {
    externalId: number;
    provider: string;
    type: "movie" | "show";
    title: string;
    posterPath: string | null;
    year: number | undefined;
    voteAverage: number | undefined;
    popularity?: number | null;
  }[];
  totalResults: number;
  isLoading: boolean;
  isError: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  isSearching: boolean;
  onFetchNextPage: () => void;
  onRefetchAll: () => void;
}

export function SearchResults({
  header,
  searchType,
  onTypeChange,
  onFilterChange,
  items,
  totalResults,
  isLoading,
  isError,
  isFetchingNextPage,
  hasNextPage,
  isSearching,
  onFetchNextPage,
  onRefetchAll,
}: SearchResultsProps): React.JSX.Element {
  const [viewMode, setViewMode] = useViewMode("canto.browse.viewMode.search");

  const browseItems: BrowseItem[] = items.map((r) => ({
    id: `${r.provider}-${r.externalId}`,
    externalId: r.externalId,
    provider: r.provider,
    type: r.type,
    title: r.title,
    posterPath: r.posterPath,
    year: r.year,
    voteAverage: r.voteAverage,
    popularity: r.popularity,
  }));

  return (
    <BrowseLayout
      title="Search"
      hideTitle
      strategy={browseStrategy}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      mediaType={searchType === "multi" ? "all" : searchType}
      filterPreset="tmdb"
      onFilterChange={onFilterChange}
      sidebarClassName="pt-8"
      header={header}
      items={browseItems}
      totalResults={totalResults}
      isLoading={isLoading}
      isFetchingNextPage={isFetchingNextPage}
      hasNextPage={hasNextPage}
      onFetchNextPage={onFetchNextPage}
      toolbar={
        <TabBar
          tabs={TYPE_OPTIONS.map(({ value, label, icon }) => ({ value, label, icon }))}
          value={searchType}
          onChange={(v) => onTypeChange(v as "multi" | "movie" | "show")}
          className="mb-0 py-0"
        />
      }
      emptyState={
        isError ? (
          <StateMessage preset="errorSearch" onRetry={onRefetchAll} minHeight="400px" />
        ) : !isLoading && totalResults === 0 && isSearching ? (
          <StateMessage preset="emptySearch" minHeight="400px" />
        ) : undefined
      }
      errorState={undefined}
    />
  );
}
