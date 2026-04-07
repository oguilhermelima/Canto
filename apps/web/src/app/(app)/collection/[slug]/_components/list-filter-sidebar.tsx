"use client";

import { cn } from "@canto/ui/cn";
import {
  FilterSidebar,
  type FilterOutput,
} from "~/components/media/filter-sidebar";

interface ListFilterSidebarProps {
  mediaType: "all" | "movie" | "show";
  visible: boolean;
  onFilterChange: (filters: FilterOutput) => void;
}

export function ListFilterSidebar({
  mediaType,
  visible,
  onFilterChange,
}: ListFilterSidebarProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "hidden w-[20rem] shrink-0 transition-[margin,opacity] duration-300 ease-in-out md:block",
        visible
          ? "mr-4 opacity-100 lg:mr-8"
          : "-ml-[20rem] mr-0 opacity-0",
      )}
    >
      <FilterSidebar
        mediaType={mediaType}
        onFilterChange={onFilterChange}
      />
    </div>
  );
}
