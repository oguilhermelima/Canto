"use client";

import { Film, Tv } from "lucide-react";
import { useRouter } from "next/navigation";
import { TabBar } from "~/components/layout/tab-bar";
import { MediaGrid } from "~/components/media/media-grid";
import { StateMessage } from "~/components/layout/state-message";
import { FilterButton } from "~/components/layout/filter-button";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies", icon: Film },
  { value: "show", label: "TV Shows", icon: Tv },
];

interface ListContentProps {
  items: {
    id: string;
    type: "movie" | "show";
    title: string;
    posterPath: string | null;
    year?: number;
    voteAverage?: number;
  }[];
  isLoading: boolean;
  typeFilter: "all" | "movie" | "show";
  onTypeChange: (type: "all" | "movie" | "show") => void;
  showFilters: boolean;
  onToggleFilters: () => void;
}

export function ListContent({
  items,
  isLoading,
  typeFilter,
  onTypeChange,
  showFilters,
  onToggleFilters,
}: ListContentProps): React.JSX.Element {
  const router = useRouter();

  return (
    <div className="min-w-0 flex-1">
      <TabBar
        tabs={TYPE_OPTIONS}
        value={typeFilter}
        onChange={(v) => onTypeChange(v as "all" | "movie" | "show")}
        leading={
          <FilterButton
            active={showFilters}
            onClick={onToggleFilters}
          />
        }
      />

      {!isLoading && items.length === 0 ? (
        <StateMessage
          preset="emptyList"
          action={{ label: "Discover Media", onClick: () => router.push("/") }}
        />
      ) : (
        <MediaGrid items={items} isLoading={isLoading} compact={showFilters} />
      )}
    </div>
  );
}
