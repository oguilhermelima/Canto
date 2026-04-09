"use client";

import { Input } from "@canto/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import { ArrowDown, ArrowUp, RotateCcw, Search } from "lucide-react";

export interface CollectionFilterState {
  sortBy: "name" | "date";
  sortOrder: "asc" | "desc";
  searchQuery: string;
}

export const DEFAULT_COLLECTION_FILTERS: CollectionFilterState = {
  sortBy: "date",
  sortOrder: "desc",
  searchQuery: "",
};

const COLLECTION_SORT_OPTIONS = [
  { value: "date", label: "Date Created" },
  { value: "name", label: "Name" },
];

export function CollectionFilterSidebar({
  filters,
  onChange,
  onReset,
}: {
  filters: CollectionFilterState;
  onChange: (filters: CollectionFilterState) => void;
  onReset: () => void;
}): React.JSX.Element {
  const update = (partial: Partial<CollectionFilterState>): void => {
    onChange({ ...filters, ...partial });
  };

  const isDesc = filters.sortOrder === "desc";
  const SortIcon = isDesc ? ArrowDown : ArrowUp;

  return (
    <div className="pt-2">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Filter</h2>
        <button
          type="button"
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={onReset}
        >
          <RotateCcw size={13} />
          Clear
        </button>
      </div>

      <div className="flex flex-col">
        {/* Search */}
        <div className="border-b border-border/40 py-4">
          <button
            type="button"
            className="mb-4 flex w-full items-center justify-between"
          >
            <span className="text-[15px] font-semibold text-foreground">Search</span>
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/30" />
            <Input
              value={filters.searchQuery}
              onChange={(e) => update({ searchQuery: e.target.value })}
              placeholder="Search lists..."
              variant="ghost"
              className="h-9 pl-9 text-[13px] font-medium text-foreground/70 placeholder:text-foreground/30"
            />
          </div>
        </div>

        {/* Sort */}
        <div className="border-b border-border/40 py-4 last:border-b-0">
          <button
            type="button"
            className="mb-4 flex w-full items-center justify-between"
          >
            <span className="text-[15px] font-semibold text-foreground">Sort By</span>
          </button>
          <div className="flex items-center gap-2">
            <Select
              value={filters.sortBy}
              onValueChange={(value) => update({ sortBy: value as "name" | "date" })}
            >
              <SelectTrigger className="h-9 flex-1 rounded-xl border-0 bg-accent px-3 text-[13px] text-foreground/70">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLLECTION_SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-0 bg-accent text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => update({ sortOrder: isDesc ? "asc" : "desc" })}
            >
              <SortIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
