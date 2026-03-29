"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@canto/ui/cn";
import { Button } from "@canto/ui/button";
import { Input } from "@canto/ui/input";
import { Slider } from "@canto/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@canto/ui/select";
import {
  ChevronDown,
  ArrowUpDown,
  RotateCcw,
  Calendar,
  Tag,
  Activity,
  Clock,
  Shield,
  Star,
  Globe,
} from "lucide-react";

const TV_GENRES = [
  { id: 10759, name: "Action & Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 10762, name: "Kids" },
  { id: 9648, name: "Mystery" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10768, name: "War & Politics" },
  { id: 37, name: "Western" },
];

const MOVIE_GENRES = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Science Fiction" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "Returning Series", label: "Returning Series" },
  { value: "Planned", label: "Planned" },
  { value: "In Production", label: "In Production" },
  { value: "Ended", label: "Ended" },
  { value: "Canceled", label: "Canceled" },
  { value: "Pilot", label: "Pilot" },
];

const CONTENT_RATING_OPTIONS = [
  { value: "", label: "All" },
  { value: "TV-Y", label: "TV-Y" },
  { value: "TV-G", label: "TV-G" },
  { value: "TV-PG", label: "TV-PG" },
  { value: "TV-14", label: "TV-14" },
  { value: "TV-MA", label: "TV-MA" },
  { value: "G", label: "G" },
  { value: "PG", label: "PG" },
  { value: "PG-13", label: "PG-13" },
  { value: "R", label: "R" },
  { value: "NC-17", label: "NC-17" },
];

const LANGUAGES = [
  { value: "all", label: "All" },
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "zh", label: "Chinese" },
];

const LIBRARY_SORT_OPTIONS = [
  { value: "addedAt", label: "Date Added" },
  { value: "title", label: "Name" },
  { value: "year", label: "Year" },
  { value: "voteAverage", label: "Rating" },
  { value: "popularity", label: "Popularity" },
];

export interface FilterState {
  sortBy: string;
  sortOrder: "asc" | "desc";
  genres: Set<string>;
  yearMin: string;
  yearMax: string;
  status: string;
  runtimeMax: string;
  contentRating: string;
  scoreMin: number[];
  language: string;
  provider: string;
}

interface MediaFilterSidebarProps {
  mediaType: "all" | "movie" | "show";
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
}

function FilterSection({
  icon: Icon,
  label,
  defaultOpen = false,
  children,
  isLast = false,
}: {
  icon: React.ComponentType<{ size: number; className?: string }>;
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  isLast?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "pb-5",
        !isLast && "mb-3 border-b border-border",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between py-2"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <Icon size={14} className="shrink-0" />
          {label}
        </span>
        <ChevronDown
          size={13}
          className={cn(
            "text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="pt-2">{children}</div>}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150",
        active
          ? "border border-primary bg-primary text-primary-foreground shadow-sm"
          : "border border-border text-muted-foreground hover:border-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

export function MediaFilterSidebar({
  mediaType,
  filters,
  onChange,
  onReset,
}: MediaFilterSidebarProps): React.JSX.Element {
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoApply = useCallback(
    (newFilters: FilterState) => {
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
      applyTimerRef.current = setTimeout(() => onChange(newFilters), 150);
    },
    [onChange],
  );

  const update = useCallback(
    (partial: Partial<FilterState>) => {
      const next = { ...filters, ...partial };
      autoApply(next);
    },
    [filters, autoApply],
  );

  const genreList =
    mediaType === "movie"
      ? MOVIE_GENRES
      : mediaType === "show"
        ? TV_GENRES
        : [
            ...TV_GENRES,
            ...MOVIE_GENRES.filter(
              (g) => !TV_GENRES.some((t) => t.id === g.id),
            ),
          ];

  const showStatus = mediaType !== "movie";

  const toggleGenre = (id: number): void => {
    const next = new Set(filters.genres);
    const key = String(id);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update({ genres: next });
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Scrollable filter area */}
      <div className="filter-sidebar min-h-0 flex-1 overflow-y-auto">
        <div className="pb-2">
          <div className="flex flex-col gap-0.5">
            {/* 1. Sort By */}
            <FilterSection icon={ArrowUpDown} label="Sort By" defaultOpen>
              <div className="flex items-center gap-2">
                <Select
                  value={filters.sortBy}
                  onValueChange={(v) => update({ sortBy: v })}
                >
                  <SelectTrigger className="h-8 flex-1 text-xs font-normal text-muted-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIBRARY_SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() =>
                    update({
                      sortOrder:
                        filters.sortOrder === "asc" ? "desc" : "asc",
                    })
                  }
                >
                  <ArrowUpDown
                    size={13}
                    className={cn(
                      "text-muted-foreground transition-transform duration-200",
                      filters.sortOrder === "desc" && "rotate-180",
                    )}
                  />
                </Button>
              </div>
            </FilterSection>

            {/* 2. Genres */}
            <FilterSection icon={Tag} label="Genres" defaultOpen>
              <div className="flex flex-wrap gap-1.5">
                {genreList.map((genre) => (
                  <FilterPill
                    key={genre.id}
                    label={genre.name}
                    active={filters.genres.has(String(genre.id))}
                    onClick={() => toggleGenre(genre.id)}
                  />
                ))}
              </div>
            </FilterSection>

            {/* 3. Release Date */}
            <FilterSection icon={Calendar} label="Release Date" defaultOpen>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="From"
                  min={1900}
                  max={2030}
                  value={filters.yearMin}
                  onChange={(e) => update({ yearMin: e.target.value })}
                  className="h-8 text-xs font-normal text-muted-foreground"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  type="number"
                  placeholder="To"
                  min={1900}
                  max={2030}
                  value={filters.yearMax}
                  onChange={(e) => update({ yearMax: e.target.value })}
                  className="h-8 text-xs font-normal text-muted-foreground"
                />
              </div>
            </FilterSection>

            {/* 4. Status (TV only) */}
            {showStatus && (
              <FilterSection icon={Activity} label="Status" defaultOpen>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((opt) => (
                    <FilterPill
                      key={opt.value}
                      label={opt.label}
                      active={filters.status === opt.value}
                      onClick={() => update({ status: opt.value })}
                    />
                  ))}
                </div>
              </FilterSection>
            )}

            {/* 5. Max Duration */}
            <FilterSection icon={Clock} label="Max Duration">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="e.g. 60"
                  value={filters.runtimeMax}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    update({ runtimeMax: val });
                  }}
                  className="h-8 pr-12 text-xs font-normal text-muted-foreground"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                  min
                </span>
              </div>
            </FilterSection>

            {/* 6. Content Rating */}
            <FilterSection icon={Shield} label="Content Rating">
              <div className="flex flex-wrap gap-1.5">
                {CONTENT_RATING_OPTIONS.map((opt) => (
                  <FilterPill
                    key={opt.value}
                    label={opt.label}
                    active={filters.contentRating === opt.value}
                    onClick={() => update({ contentRating: opt.value })}
                  />
                ))}
              </div>
            </FilterSection>

            {/* 7. Score */}
            <FilterSection icon={Star} label="Score">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Min: {filters.scoreMin[0]}</span>
                  <span>10</span>
                </div>
                <Slider
                  value={filters.scoreMin}
                  onValueChange={(v) => update({ scoreMin: v })}
                  min={0}
                  max={10}
                  step={0.5}
                  className="w-full"
                />
              </div>
            </FilterSection>

            {/* 8. Language */}
            <FilterSection icon={Globe} label="Language" isLast>
              <Select
                value={filters.language || "all"}
                onValueChange={(v) => update({ language: v === "all" ? "" : v })}
              >
                <SelectTrigger className="h-8 w-full text-xs font-normal text-muted-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSection>
          </div>
        </div>
      </div>

      {/* Footer — pinned at bottom */}
      <div className="shrink-0 border-t border-border pt-2.5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={onReset}
        >
          <RotateCcw size={12} />
          Reset Filters
        </Button>
      </div>
    </div>
  );
}
