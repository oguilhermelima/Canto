"use client";

import { Film, Tv } from "lucide-react";
import { BrowseLayout  } from "~/components/layout/browse-layout";
import type {FilterOutput} from "~/components/layout/browse-layout";
import { TabBar } from "~/components/layout/tab-bar";
import { StateMessage } from "~/components/layout/state-message";

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
  return (
    <BrowseLayout
      title="Search"
      hideTitle
      mediaType={searchType === "multi" ? "all" : searchType}
      onFilterChange={onFilterChange}
      header={header}
      items={items}
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
    />
  );
}
