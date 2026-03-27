"use client";

import { useState } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Badge } from "@canto/ui/badge";
import { Slider } from "@canto/ui/slider";
import { Separator } from "@canto/ui/separator";
import {
  ChevronDown,
  ChevronUp,
  Film,
  Tv,
  X,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react";

const GENRE_OPTIONS = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
  "War",
  "Western",
] as const;

const STATUS_OPTIONS = [
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "planned", label: "Planned" },
  { value: "dropped", label: "Dropped" },
] as const;

export interface LibraryFilters {
  type: "all" | "movie" | "show";
  genres: string[];
  yearRange: [number, number];
  ratingRange: [number, number];
  status: string | null;
}

const DEFAULT_FILTERS: LibraryFilters = {
  type: "all",
  genres: [],
  yearRange: [1900, new Date().getFullYear()],
  ratingRange: [0, 10],
  status: null,
};

interface FilterSidebarProps {
  filters: LibraryFilters;
  onFiltersChange: (filters: LibraryFilters) => void;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

export function FilterSidebar({
  filters,
  onFiltersChange,
  isOpen,
  onToggle,
  className,
}: FilterSidebarProps): React.JSX.Element {
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    type: true,
    genre: true,
    year: false,
    rating: false,
    status: false,
  });

  const toggleSection = (section: string): void => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const activeFilterCount = getActiveFilterCount(filters);

  const handleReset = (): void => {
    onFiltersChange(DEFAULT_FILTERS);
  };

  const removeFilter = (key: string, value?: string): void => {
    const next = { ...filters };
    switch (key) {
      case "type":
        next.type = "all";
        break;
      case "genre":
        next.genres = next.genres.filter((g) => g !== value);
        break;
      case "year":
        next.yearRange = DEFAULT_FILTERS.yearRange;
        break;
      case "rating":
        next.ratingRange = DEFAULT_FILTERS.ratingRange;
        break;
      case "status":
        next.status = null;
        break;
    }
    onFiltersChange(next);
  };

  return (
    <div className={className}>
      {/* Toggle button */}
      <Button
        variant="outline"
        size="sm"
        className="mb-4 gap-2"
        onClick={onToggle}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeFilterCount > 0 && (
          <Badge className="ml-1 h-5 w-5 rounded-full p-0 text-[10px]">
            {activeFilterCount}
          </Badge>
        )}
      </Button>

      {/* Active filter pills */}
      {activeFilterCount > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {filters.type !== "all" && (
            <FilterPill
              label={filters.type === "movie" ? "Movies" : "TV Shows"}
              onRemove={() => removeFilter("type")}
            />
          )}
          {filters.genres.map((genre) => (
            <FilterPill
              key={genre}
              label={genre}
              onRemove={() => removeFilter("genre", genre)}
            />
          ))}
          {(filters.yearRange[0] !== DEFAULT_FILTERS.yearRange[0] ||
            filters.yearRange[1] !== DEFAULT_FILTERS.yearRange[1]) && (
            <FilterPill
              label={`${filters.yearRange[0]}-${filters.yearRange[1]}`}
              onRemove={() => removeFilter("year")}
            />
          )}
          {(filters.ratingRange[0] !== DEFAULT_FILTERS.ratingRange[0] ||
            filters.ratingRange[1] !== DEFAULT_FILTERS.ratingRange[1]) && (
            <FilterPill
              label={`${filters.ratingRange[0]}-${filters.ratingRange[1]} rating`}
              onRemove={() => removeFilter("rating")}
            />
          )}
          {filters.status && (
            <FilterPill
              label={filters.status}
              onRemove={() => removeFilter("status")}
            />
          )}
        </div>
      )}

      {/* Sidebar content */}
      {isOpen && (
        <div className="w-full rounded-lg border border-border bg-card p-4 lg:w-64">
          {/* Type filter */}
          <FilterSection
            title="Type"
            expanded={expandedSections.type ?? true}
            onToggle={() => toggleSection("type")}
          >
            <div className="flex gap-2">
              {(["all", "movie", "show"] as const).map((t) => (
                <Button
                  key={t}
                  variant={filters.type === t ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => onFiltersChange({ ...filters, type: t })}
                >
                  {t === "movie" && <Film className="h-3.5 w-3.5" />}
                  {t === "show" && <Tv className="h-3.5 w-3.5" />}
                  {t === "all" ? "All" : t === "movie" ? "Movies" : "Shows"}
                </Button>
              ))}
            </div>
          </FilterSection>

          <Separator className="my-3" />

          {/* Genre filter */}
          <FilterSection
            title="Genre"
            expanded={expandedSections.genre ?? true}
            onToggle={() => toggleSection("genre")}
          >
            <div className="flex flex-wrap gap-1.5">
              {GENRE_OPTIONS.map((genre) => {
                const isActive = filters.genres.includes(genre);
                return (
                  <button
                    key={genre}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        genres: isActive
                          ? filters.genres.filter((g) => g !== genre)
                          : [...filters.genres, genre],
                      })
                    }
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          </FilterSection>

          <Separator className="my-3" />

          {/* Year range */}
          <FilterSection
            title="Year"
            expanded={expandedSections.year ?? false}
            onToggle={() => toggleSection("year")}
          >
            <div className="px-1">
              <Slider
                value={filters.yearRange}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    yearRange: value as [number, number],
                  })
                }
                min={1900}
                max={new Date().getFullYear()}
                step={1}
              />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{filters.yearRange[0]}</span>
                <span>{filters.yearRange[1]}</span>
              </div>
            </div>
          </FilterSection>

          <Separator className="my-3" />

          {/* Rating range */}
          <FilterSection
            title="Rating"
            expanded={expandedSections.rating ?? false}
            onToggle={() => toggleSection("rating")}
          >
            <div className="px-1">
              <Slider
                value={filters.ratingRange}
                onValueChange={(value) =>
                  onFiltersChange({
                    ...filters,
                    ratingRange: value as [number, number],
                  })
                }
                min={0}
                max={10}
                step={0.5}
              />
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{filters.ratingRange[0]}</span>
                <span>{filters.ratingRange[1]}</span>
              </div>
            </div>
          </FilterSection>

          <Separator className="my-3" />

          {/* Status filter */}
          <FilterSection
            title="Status"
            expanded={expandedSections.status ?? false}
            onToggle={() => toggleSection("status")}
          >
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map(({ value, label }) => {
                const isActive = filters.status === value;
                return (
                  <button
                    key={value}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                    onClick={() =>
                      onFiltersChange({
                        ...filters,
                        status: isActive ? null : value,
                      })
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </FilterSection>

          <Separator className="my-3" />

          {/* Reset button */}
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2 text-muted-foreground"
              onClick={handleReset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset all filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <button
        className="flex w-full items-center justify-between py-1 text-sm font-medium text-foreground"
        onClick={onToggle}
      >
        {title}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && <div className="mt-2">{children}</div>}
    </div>
  );
}

function FilterPill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <Badge
      variant="secondary"
      className="gap-1 pr-1 text-xs"
    >
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-accent"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function getActiveFilterCount(filters: LibraryFilters): number {
  let count = 0;
  if (filters.type !== "all") count++;
  count += filters.genres.length;
  if (
    filters.yearRange[0] !== DEFAULT_FILTERS.yearRange[0] ||
    filters.yearRange[1] !== DEFAULT_FILTERS.yearRange[1]
  )
    count++;
  if (
    filters.ratingRange[0] !== DEFAULT_FILTERS.ratingRange[0] ||
    filters.ratingRange[1] !== DEFAULT_FILTERS.ratingRange[1]
  )
    count++;
  if (filters.status) count++;
  return count;
}

export { DEFAULT_FILTERS };
